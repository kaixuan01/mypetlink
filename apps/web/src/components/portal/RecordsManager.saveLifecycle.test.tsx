// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { BackendCareRecord } from "@/services/apiDtos";

/**
 * The Log as done save lifecycle from the first asynchronous step, through
 * the real care service: while files are staging or the initial request is
 * waiting for its response, nothing may replace, close or reset the editor,
 * and a late result may never touch an editor it does not own.
 */
const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  deleteMedia: vi.fn(),
  uploadMediaFile: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ canUseApi: () => true, isApiConfigured: () => true }));
vi.mock("@/services/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiClient")>();
  return { ...actual, apiRequest: (...args: unknown[]) => mocks.apiRequest(...args) };
});
vi.mock("@/services/mediaService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/mediaService")>();
  return {
    ...actual,
    deleteMedia: (...args: unknown[]) => mocks.deleteMedia(...args),
    uploadMediaFile: (...args: unknown[]) => mocks.uploadMediaFile(...args),
    openPrivateMediaFile: vi.fn(),
  };
});
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, trackEvent: (...args: unknown[]) => mocks.trackEvent(...args) };
});

const { RecordsManager } = await import("./RecordsManager");
const { ApiClientError } = await import("@/services/apiClient");

const milo = mockPets[0];
const TARGET_ID = "5b7c0d2e-0000-4000-8000-000000000001";
const NEW_DRAFT = "NEW UNSAVED DRAFT";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());

function backendRecord(overrides: Partial<BackendCareRecord>): BackendCareRecord {
  return {
    id: TARGET_ID,
    petId: milo.id,
    type: "Vaccine",
    title: "Rabies booster",
    careName: null,
    date: "2025-10-12",
    dueDate: "2026-10-12",
    fulfillsCareRecordId: null,
    provider: "",
    notes: "Earlier visit",
    publicVisibility: "Private",
    derivedStatus: "overdue",
    createdAt: "2025-10-12T02:00:00Z",
    updatedAt: "2025-10-12T02:00:00Z",
    archivedAt: null,
    documents: [],
    ...overrides,
  };
}

const target = () => backendRecord({});
/** An unrelated history record the owner may want to edit next. */
const recordB = () =>
  backendRecord({
    id: "record-b",
    type: "Grooming",
    title: "Grooming visit",
    date: "2026-09-01",
    dueDate: null,
    notes: "Nail trim",
    derivedStatus: "complete",
  });
const completing = (documents: BackendCareRecord["documents"] = []) =>
  backendRecord({
    id: "completing-record",
    date: today,
    dueDate: null,
    fulfillsCareRecordId: TARGET_ID,
    notes: "Booster went well",
    derivedStatus: "complete",
    createdAt: new Date().toISOString(),
    documents,
  });

let completion: BackendCareRecord | null;
let postOutcome: () => Promise<unknown>;

function route(path: string, init?: { method?: string }) {
  if (init?.method === "POST") return postOutcome();
  if (init?.method === "PUT") return Promise.resolve({ data: { ...recordB(), notes: NEW_DRAFT }, meta: { requestId: "r" } });
  if (path.endsWith("/completion")) {
    return Promise.resolve({
      data: { state: completion ? "completed" : "pending", asOfDate: today, petName: milo.name, target: target(), completion },
      meta: { requestId: "r" },
    });
  }
  if (path.includes("/care-records?")) {
    return Promise.resolve({ data: [recordB()], meta: { requestId: "r", page: 1, pageSize: 100, total: 1 } });
  }
  return Promise.reject(new Error(`Unexpected request ${path}`));
}

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const dropped = () =>
  new ApiClientError(0, "service_unavailable", "We could not reach MyPetLink right now. Please try again.");

const posts = () => mocks.apiRequest.mock.calls.filter(([, init]) => (init as { method?: string })?.method === "POST");
const statusReads = () => mocks.apiRequest.mock.calls.filter(([path]) => String(path).endsWith("/completion"));

function renderPage() {
  window.history.replaceState({}, "", `/pets/${milo.id}/records?complete=${TARGET_ID}`);
  return render(<RecordsManager initialRecords={[]} petId={milo.id} />);
}

async function fillAndSubmitA(...files: File[]) {
  const dialog = await screen.findByRole("dialog", { name: "Log completed care" });
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Booster went well" } });
  if (files.length) {
    fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } });
    for (const file of files) await screen.findByText(file.name);
  }
  fireEvent.click(screen.getByRole("button", { name: "Save care record" }));
}

/** Everything an owner could do to leave or replace the editor. */
async function tryToLeaveAndEditB() {
  const cancel = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
  fireEvent.click(cancel);
  const close = screen.queryByRole("button", { name: "Close care record editor" });
  if (close) fireEvent.click(close);
  fireEvent.keyDown(document, { key: "Escape" });
  // The history card sits behind the modal; dispatching directly proves the
  // editor itself refuses to be replaced.
  const cardB = (await screen.findByText("Grooming visit")).closest("article")!;
  fireEvent.click(within(cardB).getByRole("button", { name: "Edit", hidden: true }));
}

function expectStillEditingA() {
  expect(screen.getByRole("dialog", { name: "Log completed care" })).toBeTruthy();
  expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Booster went well");
  expect(screen.queryByRole("dialog", { name: "Update care record" })).toBeNull();
}

async function editBWithNewDraft() {
  const cardB = (await screen.findByText("Grooming visit")).closest("article")!;
  fireEvent.click(within(cardB).getByRole("button", { name: "Edit" }));
  await screen.findByRole("dialog", { name: "Update care record" });
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: NEW_DRAFT } });
}

function expectBUntouched() {
  expect(screen.getByRole("dialog", { name: "Update care record" })).toBeTruthy();
  expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(NEW_DRAFT);
  expect(screen.queryByText(/is logged as done|Care is already logged/)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.apiRequest.mockImplementation(route);
  mocks.deleteMedia.mockResolvedValue(undefined);
  completion = null;
  postOutcome = () => Promise.reject(new Error("set per test"));
});

afterEach(() => cleanup());

describe("While the initial Log as done request is waiting", () => {
  it("cannot be cancelled, closed or replaced, and a late success then settles only its own editor", async () => {
    const post = deferred();
    postOutcome = () => post.promise;
    renderPage();
    await fillAndSubmitA();
    await waitFor(() => expect(posts()).toHaveLength(1));

    await tryToLeaveAndEditB();
    expectStillEditingA();
    expect((screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).matches(":disabled")).toBe(true);

    completion = completing();
    await act(async () => post.resolve({ data: completion, meta: { requestId: "r" } }));

    expect(await screen.findByText("Rabies booster for Milo is logged as done.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.trackEvent).toHaveBeenCalledOnce();
    expect(posts()).toHaveLength(1);

    // Only now can the owner move on, and B's draft is theirs alone.
    await editBWithNewDraft();
    expectBUntouched();
  });

  it("settles a late dropped response through reconciliation without ever giving up the editor", async () => {
    const post = deferred();
    postOutcome = () => post.promise;
    renderPage();
    await fillAndSubmitA();
    await waitFor(() => expect(posts()).toHaveLength(1));

    await tryToLeaveAndEditB();
    expectStillEditingA();

    completion = completing();
    await act(async () => post.reject(dropped()));

    expect(await screen.findByText("Care is already logged with these details.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(1);
  });

  it("cannot be left while files are still staging, and keeps the staged ids with the attempt", async () => {
    const upload = deferred();
    mocks.uploadMediaFile.mockReturnValueOnce(upload.promise);
    const post = deferred();
    postOutcome = () => post.promise;
    renderPage();
    const certificate = new File(["cert"], "certificate.pdf", { type: "application/pdf" });
    await fillAndSubmitA(certificate);
    await waitFor(() => expect(mocks.uploadMediaFile).toHaveBeenCalledOnce());

    await tryToLeaveAndEditB();
    expectStillEditingA();
    expect(posts()).toHaveLength(0);

    await act(async () =>
      upload.resolve({ mediaId: "media-new", status: "Ready", originalFileName: certificate.name, contentType: certificate.type, fileSizeBytes: certificate.size })
    );
    await waitFor(() => expect(posts()).toHaveLength(1));
    await tryToLeaveAndEditB();
    expectStillEditingA();

    // The response is lost; the record carries exactly the staged file.
    completion = completing([
      { id: "media-new", originalFileName: certificate.name, contentType: certificate.type, fileSizeBytes: certificate.size, category: "VaccinationDocument", sortOrder: 0 },
    ]);
    await act(async () => post.reject(dropped()));

    expect(await screen.findByText("Rabies booster for Milo is logged as done with your details and attachments.")).toBeTruthy();
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
  });

  it("shows a definite refusal on its own editor and lets the owner correct it", async () => {
    const post = deferred();
    postOutcome = () => post.promise;
    renderPage();
    await fillAndSubmitA();
    await waitFor(() => expect(posts()).toHaveLength(1));
    await tryToLeaveAndEditB();

    await act(async () =>
      post.reject(new ApiClientError(400, "validation_failed", "Please check the submitted fields.", { title: ["Title is required."] }))
    );

    expect(await screen.findByText("Title is required.")).toBeTruthy();
    expectStillEditingA();
    expect((screen.getByRole("button", { name: "Save care record" }) as HTMLButtonElement).disabled).toBe(false);
    expect(statusReads()).toHaveLength(1);
  });
});

describe("A late initial result after the page that sent it is gone", () => {
  it.each([
    ["a late success", (post: ReturnType<typeof deferred>) => post.resolve({ data: completing(), meta: { requestId: "r" } })],
    ["a late dropped response", (post: ReturnType<typeof deferred>) => post.reject(dropped())],
  ])("never reaches the next editor: %s", async (_label, settle) => {
    const post = deferred();
    postOutcome = () => post.promise;
    const first = renderPage();
    await fillAndSubmitA();
    await waitFor(() => expect(posts()).toHaveLength(1));
    first.unmount();

    // A fresh page: the owner edits B.
    window.history.replaceState({}, "", `/pets/${milo.id}/records`);
    render(<RecordsManager initialRecords={[]} petId={milo.id} />);
    await editBWithNewDraft();
    const readsBefore = statusReads().length;

    completion = completing();
    await act(async () => settle(post));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expectBUntouched();
    // The unmounted editor starts no reconciliation and claims nothing.
    expect(statusReads()).toHaveLength(readsBefore);
    expect(posts()).toHaveLength(1);
  });
});
