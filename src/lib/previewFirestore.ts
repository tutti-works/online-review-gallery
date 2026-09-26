import * as sdk from 'firebase/firestore';
import { isLocalPreview } from './localPreview';
export * from 'firebase/firestore';

function guarded<T extends (...args: never[]) => unknown>(fn: T): T {
  return new Proxy(fn, {
    apply(target, self, args) {
      if (isLocalPreview())
        throw new Error('プレビューのため変更は保存されません。');
      return Reflect.apply(target, self, args);
    },
  });
}
export const setDoc = guarded(sdk.setDoc);
export const addDoc = guarded(sdk.addDoc);
export const updateDoc = guarded(sdk.updateDoc);
export const deleteDoc = guarded(sdk.deleteDoc);
export const writeBatch = guarded(sdk.writeBatch);
export const runTransaction = guarded(sdk.runTransaction);
