import { ObjectId } from 'mongodb';

export function toObjectId(id: string | ObjectId): ObjectId {
  if (id instanceof ObjectId) {
    return id;
  }
  if (ObjectId.isValid(id)) {
    return new ObjectId(id);
  }
  throw new Error(`Invalid ObjectId: ${id}`);
}

export function toStringId(id: ObjectId | string): string {
  if (id instanceof ObjectId) {
    return id.toString();
  }
  return id;
}

