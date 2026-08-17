// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const ownerMocks = vi.hoisted(() => ({
  authenticated: true,
  getOwnedPetByPublicCode: vi.fn(),
}));

vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: () => ownerMocks.authenticated,
}));

vi.mock("@/services/petService", () => ({
  getOwnedPetByPublicCode: ownerMocks.getOwnedPetByPublicCode,
}));

const { useOwnedPublicProfilePet } = await import(
  "@/components/marketing/useOwnedPublicProfilePet"
);

function Probe({ publicCode }: { publicCode: string }) {
  const { pet, resolved } = useOwnedPublicProfilePet(publicCode);
  return (
    <div
      data-owned={pet ? pet.id : "none"}
      data-resolved={String(resolved)}
      data-testid="probe"
    />
  );
}

function readProbe() {
  const node = screen.getByTestId("probe");
  return {
    owned: node.getAttribute("data-owned"),
    resolved: node.getAttribute("data-resolved"),
  };
}

afterEach(cleanup);

beforeEach(() => {
  ownerMocks.authenticated = true;
  ownerMocks.getOwnedPetByPublicCode.mockReset();
});

describe("useOwnedPublicProfilePet", () => {
  it("resolves a logged-out visitor immediately without a request", async () => {
    ownerMocks.authenticated = false;

    render(<Probe publicCode="k7q2" />);

    await waitFor(() => expect(readProbe().resolved).toBe("true"));
    expect(readProbe().owned).toBe("none");
    expect(ownerMocks.getOwnedPetByPublicCode).not.toHaveBeenCalled();
  });

  it("reports the owned pet for the verified owner", async () => {
    ownerMocks.getOwnedPetByPublicCode.mockResolvedValue({
      data: { id: "pet_milo" },
    });

    render(<Probe publicCode="k7q2" />);

    await waitFor(() => expect(readProbe().owned).toBe("pet_milo"));
    expect(readProbe().resolved).toBe("true");
    expect(ownerMocks.getOwnedPetByPublicCode).toHaveBeenCalledWith("k7q2");
  });

  it("reports no owned pet for a different authenticated visitor", async () => {
    ownerMocks.getOwnedPetByPublicCode.mockResolvedValue({ data: null });

    render(<Probe publicCode="k7q2" />);

    await waitFor(() => expect(readProbe().resolved).toBe("true"));
    expect(readProbe().owned).toBe("none");
  });

  it("stays unresolved while the ownership check is in flight", async () => {
    let resolveOwnership: (value: { data: null }) => void = () => undefined;
    ownerMocks.getOwnedPetByPublicCode.mockReturnValue(
      new Promise((resolve) => {
        resolveOwnership = resolve;
      })
    );

    render(<Probe publicCode="k7q2" />);

    await waitFor(() =>
      expect(ownerMocks.getOwnedPetByPublicCode).toHaveBeenCalled()
    );
    expect(readProbe().resolved).toBe("false");
    expect(readProbe().owned).toBe("none");

    resolveOwnership({ data: null });
    await waitFor(() => expect(readProbe().resolved).toBe("true"));
  });

  it("treats a failed ownership check as not owned", async () => {
    ownerMocks.getOwnedPetByPublicCode.mockRejectedValue(new Error("offline"));

    render(<Probe publicCode="k7q2" />);

    await waitFor(() => expect(readProbe().resolved).toBe("true"));
    expect(readProbe().owned).toBe("none");
  });

  it("requests ownership once per public code", async () => {
    ownerMocks.getOwnedPetByPublicCode.mockResolvedValue({ data: null });

    render(<Probe publicCode="k7q2" />);

    await waitFor(() => expect(readProbe().resolved).toBe("true"));
    expect(ownerMocks.getOwnedPetByPublicCode).toHaveBeenCalledTimes(1);
  });
});
