export interface ModelDNA {
  gender: string
  age: string
  ethnicity: string
  bodyType: string
  skinTone: string
  skinTexture: string
  eyeColor: string
  eyeShape: string
  hairColor: string
  hairStyle: string
  hairTexture: string
  facialFeatures: string
  facialHair: string
  distinguishingMarks: string
}

export interface StyleDNA {
  clothingStyle: string
  accessories: string
  makeup: string
}

export interface PoseDNA {
  pose: string
  action: string
  expression: string
}

export interface LocationDNA {
  location: string
  background: string
  lighting: string
  weather: string
  timeOfDay: string
}

export interface CameraDNA {
  shotType: string
  cameraAngle: string
  cameraDevice: string
}

export interface VisualDNA {
  model: ModelDNA
  style: StyleDNA
  pose: PoseDNA
  location: LocationDNA
  camera: CameraDNA
}

export type DNASectionName = keyof VisualDNA
