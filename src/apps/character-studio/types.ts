export type TabId = 'physical' | 'style' | 'scene' | 'pose' | 'camera'

export interface FieldConfig {
  key: string
  label: string
  chips: string[]
  placeholder?: string
}

export interface TabConfig {
  id: TabId
  label: string
  fields: FieldConfig[]
}

export type CharacterProfile = Record<string, string>

export const TABS: TabConfig[] = [
  {
    id: 'physical',
    label: 'Physical',
    fields: [
      {
        key: 'gender',
        label: 'Gender',
        chips: ['Female', 'Male', 'Non-binary'],
      },
      {
        key: 'age',
        label: 'Age Range',
        chips: ['18-24', '20s', '25-30', '30-40', '40-50', '50+'],
      },
      {
        key: 'ethnicity',
        label: 'Ethnicity',
        chips: ['Japanese', 'Norwegian', 'American', 'French mixed with Moroccan', 'South African', 'Caucasian', 'Black', 'Asian', 'Hispanic/Latino', 'Middle Eastern', 'South Asian', 'Mixed'],
      },
      {
        key: 'bodyType',
        label: 'Body Type',
        chips: ['Slim', 'Athletic', 'Average', 'Curvy', 'Plus-size', 'Muscular'],
      },
      {
        key: 'skinTone',
        label: 'Skin Tone',
        chips: ['Fair', 'Light', 'Medium', 'Olive', 'Tan', 'Lightly sunkissed', 'Brown', 'Dark'],
      },
      {
        key: 'skinTexture',
        label: 'Skin Texture',
        chips: [
          'Glass skin finish with ultra-detailed texture, including visible skin pores, fine peach fuzz, and a scattering of light freckles across the bridge of her nose',
          'Glass skin',
          'Natural pores',
          'Acne scarring',
          'Freckled',
          'Textured',
          'Mature lines',
          'Natural pores with slight imperfections',
        ],
        placeholder: 'e.g. "Glass skin with visible pores"',
      },
      {
        key: 'eyeColor',
        label: 'Eye Color',
        chips: ['Brown', 'Blue', 'Green', 'Hazel', 'Gray', 'Amber', 'Dark brown'],
      },
      {
        key: 'eyeShape',
        label: 'Eye Shape',
        chips: ['Almond', 'Round', 'Hooded', 'Monolid', 'Upturned', 'Downturned', 'Deep-set', 'Wide-set'],
      },
      {
        key: 'hairColor',
        label: 'Hair Color',
        chips: ['Blonde', 'Brunette', 'Black', 'Red', 'Auburn', 'Gray', 'Platinum'],
      },
      {
        key: 'hairStyle',
        label: 'Hair Style',
        chips: ['Long straight', 'Long wavy', 'Shoulder-length', 'Bob', 'Pixie cut', 'Ponytail', 'Messy bun', 'Braids', 'Curtain Bangs + Layers', 'Short textured', 'Buzz cut'],
      },
      {
        key: 'hairTexture',
        label: 'Hair Texture',
        chips: ['Straight', 'Wavy', 'Curly', 'Coily', 'Kinky', 'Fine', 'Thick'],
      },
      {
        key: 'facialFeatures',
        label: 'Facial Features',
        chips: ['Freckles', 'Sharp jawline', 'Soft features', 'High cheekbones', 'Full lips', 'Glasses'],
        placeholder: 'e.g. "Light freckles, soft smile"',
      },
      {
        key: 'facialHair',
        label: 'Facial Hair',
        chips: ['None', 'Clean-shaven', 'Stubble', 'Short beard', 'Full beard', 'Goatee', 'Mustache'],
      },
      {
        key: 'distinguishingMarks',
        label: 'Distinguishing Marks',
        chips: ['None', 'Beauty mark', 'Dimples', 'Scar', 'Birthmark', 'Tattoo', 'Piercing'],
        placeholder: 'e.g. "Beauty mark on left cheek"',
      },
    ],
  },
  {
    id: 'style',
    label: 'Style',
    fields: [
      {
        key: 'clothingStyle',
        label: 'Clothing Style',
        chips: ['Alo Athleisure Set', 'Casual athleisure', 'Streetwear', 'Business casual', 'Minimalist', 'Minimal chic', 'Cozy homewear', 'Gym wear', 'Boho', 'Preppy'],
      },
      {
        key: 'accessories',
        label: 'Accessories',
        chips: ['Watch', 'Necklace', 'Earrings', 'Gold hoops', 'Baseball cap', 'Sunglasses', 'Headband', 'Rings', 'None'],
        placeholder: 'e.g. "Dainty gold necklace, small hoop earrings"',
      },
      {
        key: 'makeup',
        label: 'Makeup',
        chips: ['No makeup', 'Natural/minimal', 'Light glam', 'Full glam', 'Dewy skin', 'Bold lip', 'E-girl makeup', 'Soft glam'],
      },
    ],
  },
  {
    id: 'scene',
    label: 'Scene',
    fields: [
      {
        key: 'location',
        label: 'Location',
        chips: ['Bedroom', 'Living room', 'Kitchen', 'Bathroom', 'Car interior', 'Gym', 'Coffee shop', 'Office', 'Outdoors park', 'Beach', 'Studio backdrop'],
      },
      {
        key: 'background',
        label: 'Background Details',
        chips: ['Neutral wall', 'Bookshelf', 'Plants', 'Bed with pillows', 'Kitchen counter', 'Car Interior', 'Blurred background', 'Window with natural light', 'Minimalist'],
        placeholder: 'e.g. "Clean white wall, small monstera plant"',
      },
      {
        key: 'lighting',
        label: 'Lighting',
        chips: [
          'Soft, diffused natural window light, creating gentle highlights on the cheekbones and realistic subsurface scattering on the skin',
          'Soft natural light',
          'Golden Hour',
          'Ring Light (Influencer)',
          'Harsh Flash',
          'Dim Bedroom',
          'Natural Window Light',
          'Fluorescent office',
        ],
      },
      {
        key: 'weather',
        label: 'Weather',
        chips: ['Sunny', 'Overcast', 'Rainy', 'Cloudy', 'Golden hour', 'Blue hour', 'Indoor (N/A)'],
      },
      {
        key: 'timeOfDay',
        label: 'Time of Day',
        chips: ['Morning', 'Midday', 'Afternoon', 'Golden hour', 'Evening', 'Night'],
      },
    ],
  },
  {
    id: 'pose',
    label: 'Pose & Action',
    fields: [
      {
        key: 'pose',
        label: 'Pose',
        chips: ['Sitting on bed', 'Sitting on couch', 'Standing', 'Leaning on counter', 'Walking', 'Sitting in car', 'Front-on facing the camera', 'Laying down', 'Cross-legged on floor'],
      },
      {
        key: 'action',
        label: 'Action',
        chips: ['Speaking to camera', 'Holding product', 'Applying product', 'Unboxing', 'Pointing at something', 'Typing on phone', 'Sitting in drivers seat of car', 'Drinking from bottle', 'Showing before/after'],
        placeholder: 'e.g. "Holding product up next to face, showing label"',
      },
      {
        key: 'expression',
        label: 'Expression',
        chips: ['Natural smile', 'Genuine smile', 'Excited', 'Skeptical', 'Surprised', 'Thinking', 'Laughing', 'Serious/focused', 'Mid-sentence'],
      },
    ],
  },
  {
    id: 'camera',
    label: 'Camera',
    fields: [
      {
        key: 'shotType',
        label: 'Shot Type',
        chips: ['Close-up face', 'Medium shot (waist up)', 'Third-Person Shot', 'Full body', 'Over-the-shoulder', 'Eye level', 'Low angle', 'High angle', 'Dutch angle'],
      },
      {
        key: 'cameraAngle',
        label: 'Camera Angle',
        chips: ['Eye Level', 'Low angle', 'High angle', 'Bird\'s eye', 'Worm\'s eye', 'Dutch tilt', 'Over-the-shoulder'],
      },
      {
        key: 'cameraDevice',
        label: 'Camera Device',
        chips: [
          'iPhone 15 Pro, casual UGC aesthetic',
          'iPhone 14 Pro',
          'iPhone Front Cam',
          'iPhone selfie cam',
          'iPhone rear camera',
          'DSLR shallow DOF',
          'Webcam',
          'GoPro wide',
          'Ring light + phone',
        ],
      },
      {
        key: 'aspectRatio',
        label: 'Aspect Ratio',
        chips: ['Portrait (9:16)', 'Landscape (16:9)'],
      },
    ],
  },
]

// All field keys across all tabs
export const ALL_FIELD_KEYS = TABS.flatMap((tab) => tab.fields.map((f) => f.key))

export const PRESET_DEFAULT: CharacterProfile = {
  gender: 'Female',
  age: '25-30',
  ethnicity: 'Caucasian',
  bodyType: 'Athletic',
  skinTone: 'Medium',
  skinTexture: '',
  eyeColor: '',
  eyeShape: '',
  hairColor: 'Brunette',
  hairStyle: 'Long wavy',
  hairTexture: '',
  facialFeatures: 'Soft features, natural smile',
  facialHair: '',
  distinguishingMarks: '',
  clothingStyle: 'Casual athleisure',
  accessories: 'None',
  makeup: 'Natural/minimal',
  location: 'Bedroom',
  background: 'Neutral wall',
  lighting: 'Soft natural light',
  weather: '',
  timeOfDay: 'Morning',
  pose: 'Sitting on bed',
  action: 'Speaking to camera',
  expression: 'Natural smile',
  shotType: 'Medium shot (waist up)',
  cameraAngle: 'Eye Level',
  cameraDevice: 'iPhone selfie cam',
  aspectRatio: 'Portrait (9:16)',
}

export const PRESET_CAR: CharacterProfile = {
  gender: 'Female',
  age: '25-30',
  ethnicity: 'Caucasian',
  bodyType: 'Slim',
  skinTone: 'Fair',
  skinTexture: '',
  eyeColor: '',
  eyeShape: '',
  hairColor: 'Blonde',
  hairStyle: 'Long straight',
  hairTexture: '',
  facialFeatures: 'Light makeup, high cheekbones',
  facialHair: '',
  distinguishingMarks: '',
  clothingStyle: 'Minimal chic',
  accessories: 'Sunglasses',
  makeup: 'Light glam',
  location: 'Car interior',
  background: 'Blurred background',
  lighting: 'Soft natural light',
  weather: 'Sunny',
  timeOfDay: 'Afternoon',
  pose: 'Sitting in car',
  action: 'Speaking to camera',
  expression: 'Natural smile',
  shotType: 'Close-up face',
  cameraAngle: 'Eye Level',
  cameraDevice: 'iPhone selfie cam',
  aspectRatio: 'Portrait (9:16)',
}

export const PRESET_UGC_CAR: CharacterProfile = {
  gender: 'Female',
  age: '20s',
  ethnicity: 'American',
  bodyType: 'Athletic',
  skinTone: 'Lightly sunkissed',
  skinTexture: 'Glass skin finish with ultra-detailed texture, including visible skin pores, fine peach fuzz, and a scattering of light freckles across the bridge of her nose',
  eyeColor: 'Hazel',
  eyeShape: 'Hooded',
  hairColor: 'Blonde',
  hairStyle: 'Curtain Bangs + Layers',
  hairTexture: 'Straight',
  facialFeatures: '',
  facialHair: 'None',
  distinguishingMarks: 'Beauty mark',
  clothingStyle: 'Minimalist',
  accessories: 'Gold hoops',
  makeup: 'E-girl makeup',
  location: 'Car interior',
  background: 'Car Interior',
  lighting: 'Soft, diffused natural window light, creating gentle highlights on the cheekbones and realistic subsurface scattering on the skin',
  weather: 'Sunny',
  timeOfDay: '',
  pose: 'Front-on facing the camera',
  action: 'Sitting in drivers seat of car',
  expression: 'Genuine smile',
  shotType: 'Third-Person Shot',
  cameraAngle: 'Eye Level',
  cameraDevice: 'iPhone 15 Pro, casual UGC aesthetic',
  aspectRatio: 'Portrait (9:16)',
}

export function createEmptyProfile(): CharacterProfile {
  const profile: CharacterProfile = {}
  for (const key of ALL_FIELD_KEYS) {
    profile[key] = ''
  }
  return profile
}
