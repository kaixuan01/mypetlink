export const onRequest: PagesFunction<MyPetLinkPagesEnv, "slug"> = async (
  context
) => {
  const { handlePublicProfileRequest } = await import(
    "../../edge/publicProfileEdge"
  );
  return handlePublicProfileRequest(context);
};
