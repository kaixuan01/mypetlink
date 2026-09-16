export const onRequest: PagesFunction<MyPetLinkPagesEnv, "momentId"> = async (
  context
) => {
  const { handleMomentRequest } = await import("../../edge/momentEdge");
  return handleMomentRequest(context);
};
