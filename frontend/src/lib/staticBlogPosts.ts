/**
 * Editorial field-report posts that ship with the frontend (not Blog Studio).
 *
 * Each post has a stable slug so `/blogs/:slug` is a real, shareable page —
 * the index used to open these in a modal overlay, which hid the URL and
 * made the article unbookmarkable.
 */

export interface StaticBlogPost {
  id: string;
  slug: string;
  title: string;
  category: 'Remote Sensing' | 'Field Deployment' | 'Edge AI' | 'Agronomy';
  date: string;
  readTime: string;
  author: string;
  summary: string;
  content: string[];
  tags: string[];
  relatedDistrict?: string;
}

export const STATIC_BLOG_POSTS: StaticBlogPost[] = [
  {
    id: 'post-1',
    slug: 'offline-haor-basins-sunamganj',
    title: 'Deploying 15-Band Satellite AI in Offline Haor Basins: Lessons from Sunamganj',
    category: 'Field Deployment',
    date: 'July 14, 2026',
    readTime: '6 min read',
    author: 'Ashif Ahmed Shuvo & Field Research Team',
    summary: 'How HazardNet supports agricultural extension officers in Sunamganj with protected hosted inference and compact prediction responses during low-connectivity events.',
    content: [
      'The northeastern Haor basin of Bangladesh presents one of the most demanding operational environments for disaster early warning systems. During April and May, rapid snowmelt and heavy rainfall in the upstream Meghalaya hills can trigger flash floods that submerge hundreds of thousands of hectares of ripe Boro paddy within 24 to 48 hours.',
      'In traditional centralized cloud architectures, satellite images are processed on remote server clusters. HazardNet keeps its dual-head neural network and preprocessing assets inside a protected inference service, returning only the results required by authorized field workflows.',
      'During our field trial in Sunamganj Sadar and Tahirpur, authorized clients submitted compact telemetry payloads to the protected inference service. The service returned district-level hazard probabilities and severity advisories without exposing model files or baseline tensors to the device.',
    ],
    tags: ['Haor Basin', 'Sunamganj', 'Flash Flood', 'Offline AI', 'WASM'],
    relatedDistrict: 'sunamganj',
  },
  {
    id: 'post-2',
    slug: 'cyclone-storm-surge-sentinel-1-sar',
    title: 'Quantifying Cyclone Storm Surge Damage with Sentinel-1 SAR Backscatter Loss',
    category: 'Remote Sensing',
    date: 'June 28, 2026',
    readTime: '8 min read',
    author: 'Dr. M. Rahman (Remote Sensing Specialist)',
    summary: 'A deep dive into C-band SAR VV/VH polarization mechanics for detecting polder breaches and saline water inundation across coastal polders in Satkhira and Barguna.',
    content: [
      'Synthetic Aperture Radar (SAR) offers a critical advantage over optical satellite sensors during tropical cyclones: its microwave pulses penetrate cloud cover and rain cells day and night.',
      'When calm water floods land, smooth water surfaces act as specular reflectors, scattering radar pulses away from the satellite sensor. This causes a dramatic drop in backscatter intensity, typically -18 dB to -24 dB in VV polarization.',
      'HazardNet fuses Sentinel-1 SAR VV and VH polarizations with Sentinel-2 L2A optical NDWI indices. By calculating the continuous physical severity index (0.00 to 1.00), the model quantifies polder breach severity with a mean absolute error (MAE) of only 0.038 across Satkhira and Barguna coastal zones.',
    ],
    tags: ['Sentinel-1', 'SAR', 'Cyclone Surge', 'Satkhira', 'Polders'],
    relatedDistrict: 'satkhira',
  },
  {
    id: 'post-3',
    slug: 'protected-hosted-inference',
    title: 'Protected Hosted Inference: Keeping HazardNet Model Assets Server-Side',
    category: 'Edge AI',
    date: 'May 19, 2026',
    readTime: '7 min read',
    author: 'HazardNet Web Engineering Group',
    summary: 'Why HazardNet moved model execution into a protected server runtime and how the API returns predictions without shipping weights to browsers.',
    content: [
      'Processing multi-spectral 15-channel satellite arrays inside a protected inference service allows HazardNet to control access to both the model and its preprocessing pipeline.',
      'We replaced standard 3D convolutions with Depthwise-Separable 3D kernels, reducing parameter count by 78% while preserving 94.8% F1 classification accuracy.',
      'By moving inference to a protected server runtime, HazardNet keeps model weights private while returning compact prediction responses with consistent latency.',
    ],
    tags: ['WebAssembly', 'TFLite', 'SIMD', 'TensorFlow', 'Optimization'],
    relatedDistrict: 'kurigram',
  },
  {
    id: 'post-4',
    slug: 'barind-drought-soil-moisture',
    title: 'Barind Drought Soil Moisture Indexing: Fusing Sentinel-2 & Landsat-8 Imagery',
    category: 'Agronomy',
    date: 'April 02, 2026',
    readTime: '5 min read',
    author: 'Soil Science & Agricultural AI Working Group',
    summary: 'Preventing crop failure in Rajshahi and Naogaon through multi-sensor soil moisture tracking and Alternate Wetting & Drying (AWD) irrigation schedules.',
    content: [
      'The Barind tract in northwestern Bangladesh is characterized by dense red clay soil that bakes hard during rainfall deficits. During the dry season, ground water tables drop sharply.',
      'HazardNet monitors topsoil moisture by combining Normalized Difference Moisture Index (NDMI) from Sentinel-2 with Thermal Infrared Sensor (TIRS) Land Surface Temperature from Landsat-8.',
      'When the soil dryness severity score exceeds 0.70, automated advisories instruct farmers to switch to Alternate Wetting & Drying (AWD) irrigation, conserving up to 32% groundwater volume while maintaining full crop yield.',
    ],
    tags: ['Barind Tract', 'Rajshahi', 'Drought', 'Soil Moisture', 'AWD Irrigation'],
    relatedDistrict: 'rajshahi',
  },
];

const BY_SLUG = new Map(STATIC_BLOG_POSTS.map((post) => [post.slug, post]));

export function getStaticBlogPostBySlug(slug: string | undefined | null): StaticBlogPost | null {
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

export function staticBlogPostPath(slug: string): string {
  return `/blogs/${slug}`;
}
