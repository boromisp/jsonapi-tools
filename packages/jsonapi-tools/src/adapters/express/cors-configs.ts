'use strict';

export const allowedMethods = {
  items: ['GET', 'HEAD', 'OPTIONS', 'POST'],
  item: ['GET', 'HEAD', 'OPTIONS', 'PATCH', 'DELETE'],
  relationship: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'DELETE'],
  relatedItem: ['GET', 'HEAD', 'OPTIONS']
};

const corsConfig = {
  origin: true,
  preflightContinue: false,
  allowHeaders: ['Content-Type', 'Authorization', 'Accept', 'Accept-Encoding', 'Accept-Language', 'Connection'],
  maxAge: 86400
};

export default {
  items: Object.assign({}, corsConfig, { methods: allowedMethods.items }),
  item: Object.assign({}, corsConfig, { methods: allowedMethods.item }),
  relationship: Object.assign({}, corsConfig, { methods: allowedMethods.relationship }),
  relatedItem: Object.assign({}, corsConfig, { methods: allowedMethods.relatedItem })
};
