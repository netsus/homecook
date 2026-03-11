export interface ApiErrorField {
  field: string;
  reason: string;
}

export interface ApiError {
  code: string;
  message: string;
  fields: ApiErrorField[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
}
