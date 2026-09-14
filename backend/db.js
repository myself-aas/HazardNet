// Server-only compatibility adapter over the trusted Firebase Admin SDK.
// Never import this module from browser code. Public clients remain rule-bound.
import { getAdminDb } from './admin.js';
export const db = { get collection() { return getAdminDb().collection.bind(getAdminDb()); } };
export const collection = (parent, name) => parent.collection(name);
export const doc = (parent, ...segments) => parent.doc(segments.length ? segments.join('/') : undefined);
export const where = (...args) => (ref) => ref.where(...args);
export const orderBy = (...args) => (ref) => ref.orderBy(...args);
export const limit = (count) => (ref) => ref.limit(count);
export const query = (ref, ...constraints) => constraints.reduce((result, apply) => apply(result), ref);
export const getDocs = (ref) => ref.get();
export const getDoc = (ref) => ref.get();
export const addDoc = (ref, data) => ref.add(data);
export const setDoc = (ref, data, options) => options ? ref.set(data, options) : ref.set(data);
export const deleteDoc = (ref) => ref.delete();
export const writeBatch = () => getAdminDb().batch();
export default db;
