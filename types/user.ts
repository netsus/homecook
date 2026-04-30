import type { ApiResponse } from "@/types/api";

export interface UserSettingsData {
  settings: {
    screen_wake_lock: boolean;
  };
}

export interface UserProfileData extends UserSettingsData {
  id: string;
  nickname: string;
  email: string | null;
  profile_image_url: string | null;
  social_provider: "kakao" | "naver" | "google";
}

export interface UserDeleteData {
  deleted: true;
}

export interface UserLogoutData {
  logged_out: true;
}

export type UserSettingsResponse = ApiResponse<UserSettingsData>;
export type UserProfileResponse = ApiResponse<UserProfileData>;
export type UserDeleteResponse = ApiResponse<UserDeleteData>;
export type UserLogoutResponse = ApiResponse<UserLogoutData>;
