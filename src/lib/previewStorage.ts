import * as sdk from 'firebase/storage';
import { isLocalPreview } from './localPreview';
export * from 'firebase/storage';
function guarded<T extends (...args: never[]) => unknown>(fn: T): T {
  return new Proxy(fn, {
    apply(target, self, args) {
      if (isLocalPreview())
        throw new Error('プレビューのため変更は保存されません。');
      return Reflect.apply(target, self, args);
    },
  });
}
export const uploadBytes = guarded(sdk.uploadBytes);
export const uploadBytesResumable = guarded(sdk.uploadBytesResumable);
export const uploadString = guarded(sdk.uploadString);
export const deleteObject = guarded(sdk.deleteObject);
export const updateMetadata = guarded(sdk.updateMetadata);
