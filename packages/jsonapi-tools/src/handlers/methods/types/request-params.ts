import { IModels } from '../../../types/model';

export interface ILogger {
  error: (message: any, ...optionalArgs: any[]) => void;
}

export interface IRequestOptions {
  models: IModels;
  log?: ILogger;
}

export interface IRequestParamsBase {
  method: 'get' | 'patch' | 'post' | 'delete';
  baseUrl?: string;
  options: IRequestOptions;
}

export default IRequestParamsBase;
