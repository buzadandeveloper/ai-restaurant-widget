export type SessionResponse = {
  client_secret: {
    value: string;
  };
};

export type SessionParams = {
  configKey: string;
  aiProviderUrl: string;
  aiProviderApiKey: string;
};
