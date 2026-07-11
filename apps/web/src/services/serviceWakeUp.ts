export type ServiceWakeUpStatus = "idle" | "retrying" | "failed";

export type ServiceWakeUpSnapshot = {
  attempt: number;
  status: ServiceWakeUpStatus;
};

const idleSnapshot: ServiceWakeUpSnapshot = { attempt: 0, status: "idle" };
const listeners = new Set<() => void>();
const activeRequests = new Map<string, ServiceWakeUpSnapshot>();
const cancellations = new Map<string, () => void>();
let snapshot = idleSnapshot;
let nextRequestId = 0;

export function createWakeUpRequestId() {
  nextRequestId += 1;
  return `wake-${nextRequestId}`;
}

export function markWakeUpRetrying(requestId: string, attempt: number) {
  activeRequests.set(requestId, { attempt, status: "retrying" });
  publishCurrentState();
}

export function markWakeUpSucceeded(requestId: string) {
  activeRequests.delete(requestId);
  publishCurrentState();
}

export function markWakeUpFailed(requestId: string, attempt: number) {
  activeRequests.set(requestId, { attempt, status: "failed" });
  publishCurrentState();
}

export function clearWakeUpState() {
  activeRequests.clear();
  publishCurrentState();
}

export function registerWakeUpCancellation(
  requestId: string,
  cancellation: () => void
) {
  cancellations.set(requestId, cancellation);
  return () => cancellations.delete(requestId);
}

export function cancelActiveWakeUpRequests() {
  const activeCancellations = [...cancellations.values()];
  cancellations.clear();
  activeCancellations.forEach((cancel) => cancel());
}

export function subscribeServiceWakeUp(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getServiceWakeUpSnapshot() {
  return snapshot;
}

export function getServerServiceWakeUpSnapshot() {
  return idleSnapshot;
}

function publishCurrentState() {
  const states = [...activeRequests.values()];
  const failed = states.find((state) => state.status === "failed");
  const retrying = states
    .filter((state) => state.status === "retrying")
    .sort((left, right) => right.attempt - left.attempt)[0];

  snapshot = failed ?? retrying ?? idleSnapshot;
  listeners.forEach((listener) => listener());
}
