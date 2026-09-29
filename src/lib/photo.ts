import { uidForPhoto } from "./utils";
import type { Photo } from "../types";

/**
 * 读取照片文件并压缩为 data URL 存入浏览器。
 * 最长边限制 900px、JPEG 0.72，控制 localStorage 占用。
 */
export function fileToPhoto(
  file: File,
  caption?: string
): Promise<Photo> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请选择图片文件"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("照片读取失败"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("照片解析失败"));
      img.onload = () => {
        const MAX = 900;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width >= height) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          } else {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("浏览器不支持图片压缩"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve({
          id: uidForPhoto(),
          dataUrl: canvas.toDataURL("image/jpeg", 0.72),
          caption,
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
