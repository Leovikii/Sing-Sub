export interface CompilerDispatchCommand {
  jobId: string;
  workerUrl: string;
  jobTicket: string;
}

export interface CompilerDispatcher {
  dispatch(command: CompilerDispatchCommand): Promise<void>;
}
