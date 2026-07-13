export const onRequest: PagesFunction<MyPetLinkPagesEnv, "slug"> = async (
  context
) => {
  const { handleSocialCardRequest } = await import(
    "../../../edge/publicProfileEdge"
  );
  return handleSocialCardRequest(context);
};
