import {
  createDefaultSocialImage,
  socialImageAlt,
  socialImageContentType,
  socialImageSize,
} from "@/lib/seo/default-social-image";

export const alt = socialImageAlt;
export const contentType = socialImageContentType;
export const size = socialImageSize;

export default function TwitterImage() {
  return createDefaultSocialImage();
}
