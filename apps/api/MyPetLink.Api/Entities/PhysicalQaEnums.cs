namespace MyPetLink.Api.Entities;

public enum PhysicalQaStatus { Pending, Passed, Failed, NeedsReview }
public enum PhysicalTagCondition { Unchecked, Good, Damaged, NeedsReview }

// How a reader result was captured on the inspection screen. An external USB
// reader source is deliberately absent: that workflow is deferred until it has
// a capture-only credential and a server-side result handoff.
public enum QaCaptureSource { Camera, WebNfc }

// An existing commercial promise on a tag being enrolled. Enrollment keeps the
// promise and holds the tag; shipping stays blocked until it passes.
public enum PhysicalQaCommitmentKind { RetailOrder, MerchantOrder }
