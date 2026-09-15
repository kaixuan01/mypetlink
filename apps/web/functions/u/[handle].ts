export const onRequest: PagesFunction<MyPetLinkPagesEnv, "handle"> = async (
  context
) => {
  const { handleOwnerProfileRequest } = await import(
    "../../edge/ownerProfileEdge"
  );
  return handleOwnerProfileRequest(context);
};
