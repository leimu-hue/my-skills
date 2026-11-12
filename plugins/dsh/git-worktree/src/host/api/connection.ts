/** `connection` 服务的结构切片：只关心它能否拒绝一个请求。 */
export interface ConnectionService {
  requestRejection?(req: unknown): number | undefined | null
}
