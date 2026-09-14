import MaterialIcon from "../components/MaterialIcon";
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import { AdSenseScript, BlogAdUnit } from '../components/blog/ads/BlogAdUnit';
import { BlogArticle, listPublishedArticles, readingTimeMinutes } from '../lib/blogArticles';
import { buildBlogIndexHead } from '../lib/blogSeo';
import { useSeoHead } from '../lib/seoHead';
import { ADSENSE_SLOT_BLOG_INDEX } from '../lib/adsense';
import { useAuth } from '../context/AuthContext';

interface BlogPost {
  id: string;
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

const BLOG_POSTS: BlogPost[] = [
  {
    id: 'post-1',
    title: 'Deploying 15-Band Satellite AI in Offline Haor Basins: Lessons from Sunamganj',
    category: 'Field Deployment',
    date: 'July 14, 2026',
    readTime: '6 min read',
    author: 'Ashif Ahmed Shuvo & Field Research Team',
    summary: 'How HazardNet supports agricultural extension officers in Sunamganj with protected hosted inference and compact prediction responses during low-connectivity events.',
    content: [
      'The northeastern Haor basin of Bangladesh presents one of the most demanding operational environments for disaster early warning systems. During April and May, rapid snowmelt and heavy rainfall in the upstream Meghalaya hills can trigger flash floods that submerge hundreds of thousands of hectares of ripe Boro paddy within 24 to 48 hours.',
      'In traditional centralized cloud architectures, satellite images are processed on remote server clusters. HazardNet keeps its dual-head neural network and preprocessing assets inside a protected inference service, returning only the results required by authorized field workflows.',
      'During our field trial in Sunamganj Sadar and Tahirpur, authorized clients submitted compact telemetry payloads to the protected inference service. The service returned district-level hazard probabilities and severity advisories without exposing model files or baseline tensors to the device.'
    ],
    tags: ['Haor Basin', 'Sunamganj', 'Flash Flood', 'Offline AI', 'WASM'],
    relatedDistrict: 'sunamganj'
  },
  {
    id: 'post-2',
    title: 'Quantifying Cyclone Storm Surge Damage with Sentinel-1 SAR Backscatter Loss',
    category: 'Remote Sensing',
    date: 'June 28, 2026',
    readTime: '8 min read',
    author: 'Dr. M. Rahman (Remote Sensing Specialist)',
    summary: 'A deep dive into C-band SAR VV/VH polarization mechanics for detecting polder breaches and saline water inundation across coastal polders in Satkhira and Barguna.',
    content: [
      'Synthetic Aperture Radar (SAR) offers a critical advantage over optical satellite sensors during tropical cyclones: its microwave pulses penetrate cloud cover and rain cells day and night.',
      'When calm water floods land, smooth water surfaces act as specular reflectors, scattering radar pulses away from the satellite sensor. This causes a dramatic drop in backscatter intensity, typically -18 dB to -24 dB in VV polarization.',
      'HazardNet fuses Sentinel-1 SAR VV and VH polarizations with Sentinel-2 L2A optical NDWI indices. By calculating the continuous physical severity index (0.00 to 1.00), the model quantifies polder breach severity with a mean absolute error (MAE) of only 0.038 across Satkhira and Barguna coastal zones.'
    ],
    tags: ['Sentinel-1', 'SAR', 'Cyclone Surge', 'Satkhira', 'Polders'],
    relatedDistrict: 'satkhira'
  },
  {
    id: 'post-3',
    title: 'Protected Hosted Inference: Keeping HazardNet Model Assets Server-Side',
    category: 'Edge AI',
    date: 'May 19, 2026',
    readTime: '7 min read',
    author: 'HazardNet Web Engineering Group',
    summary: 'Why HazardNet moved model execution into a protected server runtime and how the API returns predictions without shipping weights to browsers.',
    content: [
      'Processing multi-spectral 15-channel satellite arrays inside a protected inference service allows HazardNet to control access to both the model and its preprocessing pipeline.',
      'We replaced standard 3D convolutions with Depthwise-Separable 3D kernels, reducing parameter count by 78% while preserving 94.8% F1 classification accuracy.',
      'By moving inference to a protected server runtime, HazardNet keeps model weights private while returning compact prediction responses with consistent latency.'
    ],
    tags: ['WebAssembly', 'TFLite', 'SIMD', 'TensorFlow', 'Optimization'],
    relatedDistrict: 'kurigram'
  },
  {
    id: 'post-4',
    title: 'Barind Drought Soil Moisture Indexing: Fusing Sentinel-2 & Landsat-8 Imagery',
    category: 'Agronomy',
    date: 'April 02, 2026',
    readTime: '5 min read',
    author: 'Soil Science & Agricultural AI Working Group',
    summary: 'Preventing crop failure in Rajshahi and Naogaon through multi-sensor soil moisture tracking and Alternate Wetting & Drying (AWD) irrigation schedules.',
    content: [
      'The Barind tract in northwestern Bangladesh is characterized by dense red clay soil that bakes hard during rainfall deficits. During the dry season, ground water tables drop sharply.',
      'HazardNet monitors topsoil moisture by combining Normalized Difference Moisture Index (NDMI) from Sentinel-2 with Thermal Infrared Sensor (TIRS) Land Surface Temperature from Landsat-8.',
      'When the soil dryness severity score exceeds 0.70, automated advisories instruct farmers to switch to Alternate Wetting & Drying (AWD) irrigation, conserving up to 32% groundwater volume while maintaining full crop yield.'
    ],
    tags: ['Barind Tract', 'Rajshahi', 'Drought', 'Soil Moisture', 'AWD Irrigation'],
    relatedDistrict: 'rajshahi'
  }
];

export const Blogs: React.FC = () => {
  const { user, loading } = useAuth();
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [liveArticles, setLiveArticles] = useState<BlogArticle[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listPublishedArticles().then((result) => {
      if (!cancelled && !result.error) setLiveArticles(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-route SEO metadata for the blog index (title/description/canonical).
  const indexHead = useMemo(() => buildBlogIndexHead({ origin: window.location.origin }), []);
  useSeoHead(indexHead);

  /**
   * The "Blog Studio" entry point is hidden by default. It renders ONLY for
   * the three primary superadmin accounts (frontend/src/lib/superadmins.ts)
   * after the auth session has resolved — never for guests or regular users,
   * and never while the session is still loading.
   */
  const showStudioButton = !loading && Boolean(user);

  const filteredPosts = BLOG_POSTS.filter(
    (post) => filterCategory === 'All' || post.category === filterCategory
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto"
    >
      <AdSenseScript />
      <Breadcrumbs />

      {/* Header Banner */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 md:p-8 shadow-md relative overflow-hidden space-y-3">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#f9a825]"></div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-extrabold bg-amber-50 text-amber-900 border border-amber-300 uppercase tracking-wider shadow-2xs">
            Research Insights & Field Reports
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-slate-500 font-semibold">HazardNet Knowledge Base</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
          HazardNet AI Blog & Field Deployment Studies
        </h1>
        <p className="text-slate-600 text-xs md:text-sm leading-relaxed max-w-3xl">
          Technical deep-dives, remote sensing methodologies, field deployment case studies, and edge WebAssembly optimizations written by the HazardNet research team.
        </p>

        {showStudioButton && (
          <Link
            to="/dashboard/blog"
            data-testid="blog-studio-btn"
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white shadow-md transition-colors hover:bg-slate-700"
          >
            <MaterialIcon name="doc" className="w-4 h-4" /> Blog Studio — write & manage articles
          </Link>
        )}
      </div>

      {/* Published articles from the Blog Studio (each at /blogs/:slug) */}
      {liveArticles.length > 0 && (
        <section className="space-y-3" data-testid="live-articles">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Latest articles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveArticles.map((article) => (
              <Link
                key={article.id}
                to={`/blogs/${article.slug}`}
                className="group bg-white border border-emerald-200/70 rounded-3xl p-5 shadow-sm hover:border-amber-400/80 hover:shadow-xl transition-all flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">{article.category}</span>
                    <span className="text-slate-400">{readingTimeMinutes(article.contentHtml)} min read</span>
                  </div>
                  <h3 className="text-sm font-black text-slate-900 group-hover:text-amber-900 leading-snug">{article.title}</h3>
                  <p className="text-xs text-slate-600 line-clamp-2">{article.excerpt}</p>
                </div>
                <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between">
                  <span>{article.authorName}</span>
                  <span className="font-black text-slate-900 group-hover:text-amber-900">Read → /blogs/{article.slug}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Display ad (blogs page only — the sole monetized surface) */}
      <BlogAdUnit slot={ADSENSE_SLOT_BLOG_INDEX} format="horizontal" label="Advertisement" className="not-prose" />

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
        {['All', 'Remote Sensing', 'Field Deployment', 'Edge AI', 'Agronomy'].map((cat) => (
          <motion.button
            key={cat}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setFilterCategory(cat)}
            className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all duration-200 cursor-pointer ${
              filterCategory === cat
                ? 'bg-[#f9a825] text-slate-950 font-black shadow-md shadow-amber-500/20'
                : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 shadow-2xs'
            }`}
          >
            {cat}
          </motion.button>
        ))}
      </div>

      {/* Blog Cards Grid */}
      <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence>
          {filteredPosts.map((post) => (
            <motion.article
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              key={post.id}
              whileHover={{ y: -4 }}
              onClick={() => setSelectedPost(post)}
              className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm hover:border-amber-400/80 hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between gap-5 group relative overflow-hidden"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="px-2.5 py-1 rounded-lg font-extrabold bg-slate-100 text-slate-800 border border-slate-200/80 group-hover:bg-amber-100 group-hover:border-amber-200 transition-colors">
                    {post.category}
                  </span>
                  <span className="text-slate-500 font-medium">{post.readTime}</span>
                </div>

                <h2 className="text-base font-black text-slate-900 group-hover:text-amber-900 transition-colors leading-snug">
                  {post.title}
                </h2>

                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 font-normal">
                  {post.summary}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-medium text-slate-500">{post.date}</span>
                <span className="font-black text-slate-900 group-hover:text-amber-900 transition-colors flex items-center gap-1">
                  <span>Read Full Article</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </span>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Article Detail Reader Modal / Drawer */}
      <AnimatePresence>
        {selectedPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative text-slate-900"
            >
              
              <button
                onClick={() => setSelectedPost(null)}
                className="absolute top-5 right-5 p-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs transition-colors cursor-pointer"
              >
                ✕ Close
              </button>

              <div className="space-y-3 pr-10">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-2.5 py-1 rounded-lg font-extrabold bg-amber-100 text-amber-950 border border-amber-200">
                    {selectedPost.category}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500 font-semibold">{selectedPost.date}</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500 font-semibold">{selectedPost.readTime}</span>
                </div>

                <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                  {selectedPost.title}
                </h2>

                <p className="text-xs text-slate-700 font-extrabold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>By {selectedPost.author}</span>
                </p>
              </div>

              <div className="space-y-4 text-xs md:text-sm text-slate-700 leading-relaxed border-t border-b border-slate-100 py-6">
                {selectedPost.content.map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <div className="flex flex-wrap gap-2">
                  {selectedPost.tags.map((tag, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-slate-100 border border-slate-200 text-slate-700">
                      #{tag}
                    </span>
                  ))}
                </div>

                {selectedPost.relatedDistrict && (
                  <Link
                    to={`/?district=${selectedPost.relatedDistrict}`}
                    onClick={() => setSelectedPost(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <MaterialIcon name="satellite_alt" className="w-4 h-4 inline-block mr-1" /> View on GIS Map
                  </Link>
                )}
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};

export default Blogs;
