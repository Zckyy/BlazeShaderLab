export type BlendMode = 'normal' | 'add' | 'multiply'

// float params are numbers; color params are hex strings like '#ff00aa'
export type ParamValue = number | string

export interface Layer {
  uid: string
  effectId: string
  enabled: boolean
  // locked layers can't be moved, deleted, edited, or randomized
  locked?: boolean
  opacity: number
  blend: BlendMode
  values: Record<string, ParamValue>
}
