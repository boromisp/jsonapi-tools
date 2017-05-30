export interface IRequestParamsBase {
  method: 'get' | 'patch' | 'post' | 'delete';
  options: object;
}

export default IRequestParamsBase;
