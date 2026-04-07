import axios from "axios";
import type { AxiosInstance, AxiosRequestConfig } from "axios";

export class ApiClient {
  private readonly axiosInstance: AxiosInstance;

  constructor(url: string) {
    this.axiosInstance = axios.create({
      baseURL: url,
    });
  }

  async post<T>(url: string, data = {}, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.post<T>(url, data, config);

    return response.data;
  }
}
