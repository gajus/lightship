export default (): boolean => {
  // eslint-disable-next-line node/no-process-env
  return Boolean(process.env.KUBERNETES_SERVICE_HOST);
};
