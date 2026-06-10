import { requestMypage } from "@/lib/api/mypage";
import type { UserProgressData } from "@/types/user-progress";

export async function fetchUserProgress() {
  return requestMypage<UserProgressData>("/api/v1/users/me/progress");
}
