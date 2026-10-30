import { axiosClient } from "./axiosClient";

export type UserRole = "Admin" | "Author";
export type AdminUser = {
  id: string; email: string; displayName: string; roles: string[];
  isActive: boolean; createdAt: string;
};
export type AdminUsersPage = {
  data: AdminUser[];
  meta: { page: number; pageSize: number; totalCount: number; totalPages: number;
    hasNextPage: boolean; hasPreviousPage: boolean };
};

export async function listAdminUsers(page: number, role: UserRole | ""): Promise<AdminUsersPage> {
  const response = await axiosClient.get<AdminUsersPage>("/api/v1/admin/users", {
    params: { page, pageSize: 20, ...(role ? { role } : {}) },
  });
  return response.data;
}

export async function setUserRole(userId: string, role: UserRole): Promise<AdminUser> {
  const response = await axiosClient.post<{ data: AdminUser }>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/roles`, { role });
  return response.data.data;
}
