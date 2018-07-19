import {
    IResourceObject,
    IBatchOperation,
    isBatchMeta,
    IResourceLinkage,
    IResourceIdentifierObject,
    IJSONValue,
    IRelationshipObject,
    IBatchResourceDocument
} from 'jsonapi-types';

import { ISchema } from '../types/model';

export { IBatchResourceDocument };

interface ISchemas { [key: string]: ISchema; }



function relatedIDsAreTheSame(relatedID: string[]|string|null, linkage: IResourceLinkage): boolean {
    if (relatedID === linkage) {
        return true;
    }
    if (Array.isArray(relatedID) && Array.isArray(linkage) && relatedID.length === linkage.length && 
        relatedID.every(id => linkage.some(l => l.id === id)) &&
        linkage.every(l => relatedID.some(id => id === l.id))
    ) {
        return true;
    }
    if (!Array.isArray(linkage) && linkage && linkage.id === relatedID) {
        return true;
    }
    return false;
}

export function createLinkage(res: IResourceObject | IBatchOperation): IResourceIdentifierObject {
    if (isBatchMeta(res.meta) && res.meta['batch-key']) {
        return {
            type: res.type,
            meta: res.meta,
            id: res.meta['batch-key']!
        };
    }
    return {
        type: res.type,
        id: res.id!
    };
}

export default class Store {
    _schemas: ISchemas;
    _data: Map<string, Map<string, IResourceObject>>;
    _changedData: Map<string, Map<string, IBatchOperation>>;
    _newData: Map<string, Map<string, IBatchOperation>>;
    _deleted: Map<string, Set<string>>;

    constructor(schemas: ISchemas) {
        this._schemas = schemas;
        this._data = new Map();
        this._changedData = new Map();
        this._newData = new Map();
        this._deleted = new Map();
        
        for (const type of Object.keys(schemas)) {
            this._data.set(type, new Map());
            this._changedData.set(type, new Map());
            this._newData.set(type, new Map());
            this._deleted.set(type, new Set());
        }
    }

    getSchema(type: string): ISchema {
        return this._schemas[type];
    }

    loadItem(item: IResourceObject) {
        this._data.get(item.type)!.set(item.id, item);
    }

    loadItems(items: IResourceObject[]) {
        items.forEach(this.loadItem, this)
    }

    getItem(type: string, id: string): IResourceObject|IBatchOperation|undefined {
        const item = this._newData.get(type)!.get(id);
        if (item) {
            return item;
        }
        if (!this._deleted.get(type)!.has(id)) {
            return this._data.get(type)!.get(id)
        }
        return undefined;
    }

    getLinkageTo(type: string, id: string): IResourceIdentifierObject|undefined {
        const item = this.getItem(type, id);
        return item && createLinkage(item);
    }

    newItem(type: string, id: string): IBatchOperation {
        const res: IBatchOperation = {
            type,
            meta: { op: 'create', 'batch-key': id }
        };
        const schema = this.getSchema(type);
        if (schema.relationships) {
            res.relationships = {};
        }
        if (schema.attributes && schema.attributes.length) {
            res.attributes = {};
        }
        this._newData.get(type)!.set(id, res);
        return res;
    }

    deleteItem(type: string, id: string) {
        if (this._newData.get(type)!.has(id)) {
            this._newData.get(type)!.delete(id);
        } else {
            this._deleted.get(type)!.add(id);
        }
    }

    getAttributeValue(type: string, id: string, attribute: string): IJSONValue {
        const changedItem = this._changedData.get(type)!.get(id);
        if (changedItem && changedItem.attributes && changedItem.attributes.hasOwnProperty(attribute)) {
            return changedItem.attributes[attribute];
        }
        return this.getItem(type, id)!.attributes![attribute];
    }

    getRelatedID(type: string, id: string, relationship: string): string[]|string|null {
        const linkage = this.getItem(type, id)!.relationships![relationship].data;
        if (!linkage) {
            return null;
        }
        if (Array.isArray(linkage)) {
            return linkage.map(l => l.id);
        }
        return linkage.id;
    }

    setAttributeValue(type: string, id: string, attribute: string, value: IJSONValue) {
        const newItem = this._newData.get(type)!.get(id);
        if (newItem) {
            newItem.attributes![attribute] = value;
            return;
        }

        let changedItem = this._changedData.get(type)!.get(id);

        const savedValue = this.getItem(type, id)!.attributes![attribute];
        if (savedValue === value) {
            if (changedItem && changedItem.attributes) {
                delete changedItem.attributes[attribute];
                if (Object.keys(changedItem.attributes).length === 0) {
                    delete changedItem.attributes;
                    if (!changedItem.relationships) {
                        this._changedData.get(type)!.delete(id);
                    }
                }
            }
        } else {
            if (!changedItem) {
                changedItem = { type, id, meta: { op: 'update' } };
                this._changedData.get(type)!.set(id, changedItem);
            }
            if (!changedItem.attributes) {
                changedItem.attributes = {};
            }
            changedItem.attributes[attribute] = value;
        }
    }

    _createLinkage(type: string, relationship: string, relatedID: string[]|string|null): IRelationshipObject {
        if (relatedID === null) {
            return { data: null };
        } else {
            const relType = this.getSchema(type).relationships![relationship].type;
            if (Array.isArray(relatedID)) {
                return {
                    data: relatedID.map(id => {
                        if (this._newData.get(relType)!.has(id)) {
                            return { type: relType, id, meta: { 'batch-key': id } };
                        } else {
                            return { type: relType, id };
                        }
                    })
                };
            } else {
                if (this._newData.get(relType)!.has(relatedID)) {
                    return { data: { type: relType, id: relatedID, meta: { 'batch-key': relatedID } } };
                } else {
                    return { data: { type: relType, id: relatedID } };
                }
            }
        }
    }

    setRelatedID(type: string, id: string, relationship: string, relatedID: string[]|string|null) {
        const newItem = this._newData.get(type)!.get(id);
        if (newItem) {
            newItem.relationships![relationship] = this._createLinkage(type, relationship, relatedID);
            return;
        }

        let changedItem = this._changedData.get(type)!.get(id);
        const savedLinkage = this.getItem(type, id)!.relationships![relationship].data;

        if (relatedIDsAreTheSame(relatedID, savedLinkage)) {
            if (changedItem && changedItem.relationships) {
                delete changedItem.relationships[relationship];
                if (Object.keys(changedItem.relationships).length === 0) {
                    delete changedItem.relationships;
                    if (!changedItem.attributes) {
                        this._changedData.get(type)!.delete(id);
                    }
                }
            }
        } else {
            if (!changedItem) {
                changedItem = { type, id, meta: { op: 'update' } };
                this._changedData.get(type)!.set(id, changedItem);
            }
            if (!changedItem.relationships) {
                changedItem.relationships = {};
            }
            changedItem.relationships[relationship] = this._createLinkage(type, relationship, relatedID);
        }
    }

    getSaveData(): IBatchResourceDocument {
        const batch: IBatchOperation[] = [];

        for (const [type, ids] of this._deleted) {
            for (const id of ids) {
                batch.push({ type, id, meta: { op: 'delete' } });
            }
        }

        for (const newWithType of this._newData.values()) {
            for (const op of newWithType.values()) {
                batch.push(op);
            }
        }

        for (const changedWithType of this._changedData.values()) {
            for (const res of changedWithType.values()) {
                batch.push(res);
            }
        }

        return { batch };
    }

    applySavedData(data: (IResourceObject|null)[]) {
        for (const res of data) {
            const batchKey = res && isBatchMeta(res.meta) && res.meta['batch-key'];
            if (batchKey && this._newData.get(res!.type)!.get(batchKey)) {
                this._data.get(res!.type)!.set(res!.id, res!);
                this._newData.get(res!.type)!.delete(batchKey);
            }
        }

        for (const newWithType of this._newData.values()) {
            newWithType.clear();
        }

        for (const changedWithType of this._changedData.values()) {
            for (const res of changedWithType.values()) {
                const saved = this._data.get(res.type)!.get(res.id!)!;
                if (res.attributes) {
                    if (!saved.attributes) {
                        saved.attributes = {};
                    }
                    for (const attr of Object.keys(res.attributes)) {
                        saved.attributes[attr] = res.attributes[attr];
                    }
                }
                if (res.relationships) {
                    if (!saved.relationships) {
                        saved.relationships = {};
                    }
                    for (const rel of Object.keys(res.relationships)) {
                        saved.relationships[rel] = res.relationships[rel];
                    }
                }
            }
            changedWithType.clear();
        }

        for (const deletedWithType of this._deleted.values()) {
            deletedWithType.clear();
        }
    }
}
