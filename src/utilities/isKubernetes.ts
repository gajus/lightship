export default (): boolean => {
  // eslint-disable-next-line no-process-env
  return Boolean(process.env.KUBERNETES_SERVICE_HOST);
};
