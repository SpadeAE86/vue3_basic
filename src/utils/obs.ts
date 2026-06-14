import ObsClient from 'esdk-obs-browserjs'
import { TOS } from '@volcengine/tos-sdk'

// Get env values with defaults
const PROVIDER = import.meta.env.VITE_STORAGE_PROVIDER || 'huawei'

// Huawei OBS variables
const HW_AK = import.meta.env.VITE_HUAWEI_OBS_AK || 'UJDPK31ANIBV0XTEUN5N'
const HW_SK = import.meta.env.VITE_HUAWEI_OBS_SK || 'NhQExxv9PUYsvmvGnVReizRksaiHcJdQ6vMMw19d'
const HW_SERVER = import.meta.env.VITE_HUAWEI_OBS_SERVER || 'https://obs.cn-east-3.myhuaweicloud.com'
const HW_BUCKET = import.meta.env.VITE_HUAWEI_OBS_BUCKET || 'freeuuu'

// Volcengine TOS variables
const VOLC_AK = import.meta.env.VITE_VOLCENGINE_TOS_AK || ''
const VOLC_SK = import.meta.env.VITE_VOLCENGINE_TOS_SK || ''
const VOLC_ENDPOINT = import.meta.env.VITE_VOLCENGINE_TOS_ENDPOINT || 'tos-s3-cn-beijing.volces.com'
const VOLC_REGION = import.meta.env.VITE_VOLCENGINE_TOS_REGION || 'cn-beijing'
const VOLC_BUCKET = import.meta.env.VITE_VOLCENGINE_TOS_BUCKET || ''

// Clients initialized lazily
let obsClient: any = null
let tosClient: any = null

export function getObsClient() {
  if (!obsClient) {
    obsClient = new ObsClient({
      access_key_id: HW_AK,
      secret_access_key: HW_SK,
      server: HW_SERVER
    })
  }
  return obsClient
}

export function getTosClient() {
  if (!tosClient) {
    tosClient = new TOS({
      accessKeyId: VOLC_AK,
      accessKeySecret: VOLC_SK,
      endpoint: VOLC_ENDPOINT,
      region: VOLC_REGION
    })
  }
  return tosClient
}

// Keep BUCKET_NAME exported for compatibility
export const BUCKET_NAME = PROVIDER === 'volcengine' ? VOLC_BUCKET : HW_BUCKET

export function getMediaType(fileType: string): 'image' | 'video' | 'audio' | null {
  if (fileType.startsWith('image/')) return 'image'
  if (fileType.startsWith('video/')) return 'video'
  if (fileType.startsWith('audio/')) return 'audio'
  return null
}

export async function uploadToObs(
  file: File,
  prefix: string = 'ai_picture/reference_image',
  onProgress?: (percent: number) => void
): Promise<string> {
  const id = Math.random().toString(36).substring(2, 15)
  const ext = file.name.split('.').pop() || 'tmp'
  const timestamp = new Date().getTime()
  const filename = `${timestamp}_${id}.${ext}`
  const objectKey = `${prefix}/${filename}`

  if (PROVIDER === 'volcengine') {
    const client = getTosClient()
    await client.putObject({
      bucket: VOLC_BUCKET,
      key: objectKey,
      body: file,
      dataTransferStatusChange: (status: any) => {
        if (onProgress && status.totalBytes > 0) {
          const percent = Math.round((status.consumedBytes * 100.0) / status.totalBytes)
          onProgress(percent)
        }
      }
    })
    const cleanEndpoint = VOLC_ENDPOINT.replace('https://', '').replace('http://', '')
    return `https://${VOLC_BUCKET}.${cleanEndpoint}/${objectKey}`
  } else {
    const client = getObsClient()
    const result = await new Promise<any>((resolve, reject) => {
      client.putObject({
        Bucket: HW_BUCKET,
        Key: objectKey,
        SourceFile: file,
        ProgressCallback: function (transferredAmount: number, totalAmount: number) {
          if (onProgress) {
            const percent = Math.round((transferredAmount * 100.0) / totalAmount)
            onProgress(percent)
          }
        }
      }, (err: Error | null, res: any) => {
        if (err) reject(err)
        else resolve(res)
      })
    })

    if (result.CommonMsg.Status < 300) {
      const cleanServer = HW_SERVER.replace('https://', '').replace('http://', '')
      return `https://${HW_BUCKET}.${cleanServer}/${objectKey}`
    } else {
      throw new Error(`Upload failed with status ${result.CommonMsg.Status}`)
    }
  }
}
