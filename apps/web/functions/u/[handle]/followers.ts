export const onRequest: PagesFunction<MyPetLinkPagesEnv, "handle"> = async (
  context
) => {
  const { handleOwnerConnectionsRequest } = await import(
    "../../../edge/ownerConnectionsEdge"
  );
  return handleOwnerConnectionsRequest(context, "followers");
};
