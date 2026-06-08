import ObsClient from 'esdk-obs-browserjs'

export const obsClient = new ObsClient({
  access_key_id: 'UJDPK31ANIBV0XTEUN5N',
  secret_access_key: 'NhQExxv9PUYsvmvGnVReizRksaiHcJdQ6vMMw19d',
  server: 'https://obs.cn-east-3.myhuaweicloud.com'
})

export const BUCKET_NAME = 'freeuuu'

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
  const mediaType = getMediaType(file.type) || 'image'
  const ext = file.name.split('.').pop() || 'tmp'
  const timestamp = new Date().getTime()
  const filename = `${timestamp}_${id}.${ext}`
  const objectKey = `${prefix}/${filename}`

  const result = await new Promise<any>((resolve, reject) => {
    obsClient.putObject({
      Bucket: BUCKET_NAME,
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
    return `https://${BUCKET_NAME}.obs.cn-east-3.myhuaweicloud.com/${objectKey}`
  } else {
    throw new Error(`Upload failed with status ${result.CommonMsg.Status}`)
  }
}
