import $axios from "axios";
import type { AxiosInstance, AxiosRequestConfig } from "axios";

class ApiClient {
  private readonly axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = $axios.create({
      baseURL: import.meta.env.VITE_BASE_URL,
    });
  }

  async post<T>(url: string, data = {}, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.post<T>(url, data, config);

    return response.data;
  }
}

export const apiClient = new ApiClient();