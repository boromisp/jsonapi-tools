import { IResourceLinks } from 'jsonapi-types';

export default (baseUrl?: string, links?: IResourceLinks): IResourceLinks | undefined => {
    if (typeof baseUrl === 'string' && links) {
      (Object.keys(links) as (keyof IResourceLinks)[]).forEach(name => {
        const link = links![name];
        if (typeof link === 'string') {
          links![name] = baseUrl + link;
        } else if (link) {
          link.href = baseUrl + link.href;
        }
      });
      return links;
    }
    return;
};
