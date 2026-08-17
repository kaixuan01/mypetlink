export const onRequest: PagesFunction<MyPetLinkPagesEnv, "slug"> = async (
  context
) => {
  const { handleFinderPreviewRequest } = await import(
    "../../edge/publicProfileEdge"
  );
  return handleFinderPreviewRequest(context, "safety");
};
