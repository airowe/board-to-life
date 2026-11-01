export const DEFAULT_STUB_MODE = 'ok';

export const stubModeFor = ({ isDev, picked }: { isDev: boolean; picked: string }): string =>
  isDev ? picked : DEFAULT_STUB_MODE;
