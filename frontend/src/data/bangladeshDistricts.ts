export interface DistrictData {
  id: string;
  name: string;
  division: string;
  lat: number;
  lng: number;
  risk: 'Low' | 'Moderate' | 'High';
  severity: number; // 0.0 to 1.0 continuous severity index
  // Static baseline hazards + the 8 live model classes served by
  // /api/v1/forecasts/bulk (backend/utils/forecastRow.js VALID_HAZARDS).
  hazardType:
    | 'Flash Flood'
    | 'Monsoon Flood'
    | 'Drought'
    | 'Tropical Cyclone'
    | 'Cold Wave'
    | 'Severe Storm'
    | 'Flood'
    | 'Heat Wave'
    | 'Fire'
    | 'Severe Local Storm';
  mainCrop: string;
  elevationMeters: number;
  cx: number; // SVG relative X percent (0 - 100)
  cy: number; // SVG relative Y percent (0 - 100)
}

export interface DivisionData {
  id: string;
  name: string;
  capital: string;
  districtCount: number;
  lat: number;
  lng: number;
  avgSeverity: number;
  primaryHazard: string;
  path: string; // SVG path
  fill: string;
  stroke: string;
  cx: number;
  cy: number;
}

// Complete Official Dataset for All 64 Districts of Bangladesh
export const ALL_64_DISTRICTS: DistrictData[] = [
  // --- 1. RANGPUR DIVISION (8 Districts) ---
  { id: 'kurigram', name: 'Kurigram', division: 'Rangpur', lat: 25.8058, lng: 89.6361, risk: 'High', severity: 0.88, hazardType: 'Monsoon Flood', mainCrop: 'Aman Rice & Jute', elevationMeters: 28, cx: 48, cy: 16 },
  { id: 'rangpur', name: 'Rangpur', division: 'Rangpur', lat: 25.7439, lng: 89.2752, risk: 'Moderate', severity: 0.52, hazardType: 'Cold Wave', mainCrop: 'Potato & Tobacco', elevationMeters: 34, cx: 38, cy: 18 },
  { id: 'gaibandha', name: 'Gaibandha', division: 'Rangpur', lat: 25.3288, lng: 89.5403, risk: 'High', severity: 0.82, hazardType: 'Monsoon Flood', mainCrop: 'Boro Paddy & Maize', elevationMeters: 24, cx: 45, cy: 24 },
  { id: 'nilphamari', name: 'Nilphamari', division: 'Rangpur', lat: 25.9312, lng: 88.8560, risk: 'Moderate', severity: 0.48, hazardType: 'Cold Wave', mainCrop: 'Sesame & Wheat', elevationMeters: 38, cx: 30, cy: 14 },
  { id: 'dinajpur', name: 'Dinajpur', division: 'Rangpur', lat: 25.6279, lng: 88.6332, risk: 'Low', severity: 0.38, hazardType: 'Drought', mainCrop: 'Kataribhog Rice & Litchi', elevationMeters: 37, cx: 25, cy: 20 },
  { id: 'panchagarh', name: 'Panchagarh', division: 'Rangpur', lat: 26.3411, lng: 88.5541, risk: 'Moderate', severity: 0.55, hazardType: 'Cold Wave', mainCrop: 'Tea Gardens & Sugarcane', elevationMeters: 55, cx: 20, cy: 6 },
  { id: 'thakurgaon', name: 'Thakurgaon', division: 'Rangpur', lat: 26.0337, lng: 88.4617, risk: 'Low', severity: 0.42, hazardType: 'Cold Wave', mainCrop: 'Potato & Wheat', elevationMeters: 48, cx: 18, cy: 12 },
  { id: 'lalmonirhat', name: 'Lalmonirhat', division: 'Rangpur', lat: 25.9165, lng: 89.4532, risk: 'High', severity: 0.79, hazardType: 'Monsoon Flood', mainCrop: 'Maize & Tobacco', elevationMeters: 30, cx: 43, cy: 12 },

  // --- 2. RAJSHAHI DIVISION (8 Districts) ---
  { id: 'rajshahi', name: 'Rajshahi', division: 'Rajshahi', lat: 24.3745, lng: 88.6042, risk: 'Moderate', severity: 0.58, hazardType: 'Drought', mainCrop: 'Mango Orchards & Wheat', elevationMeters: 20, cx: 26, cy: 43 },
  { id: 'bogra', name: 'Bogra', division: 'Rajshahi', lat: 24.8481, lng: 89.3730, risk: 'Moderate', severity: 0.49, hazardType: 'Drought', mainCrop: 'Vegetables & Red Chili', elevationMeters: 22, cx: 41, cy: 33 },
  { id: 'sirajganj', name: 'Sirajganj', division: 'Rajshahi', lat: 24.4534, lng: 89.7008, risk: 'High', severity: 0.85, hazardType: 'Monsoon Flood', mainCrop: 'Mustard & Boro Paddy', elevationMeters: 18, cx: 46, cy: 42 },
  { id: 'pabna', name: 'Pabna', division: 'Rajshahi', lat: 24.0064, lng: 89.2372, risk: 'Moderate', severity: 0.61, hazardType: 'Monsoon Flood', mainCrop: 'Pulses & Mustard', elevationMeters: 16, cx: 38, cy: 49 },
  { id: 'naogaon', name: 'Naogaon', division: 'Rajshahi', lat: 24.8103, lng: 88.9414, risk: 'Moderate', severity: 0.51, hazardType: 'Drought', mainCrop: 'Fine Rice (Aman/Boro)', elevationMeters: 22, cx: 31, cy: 34 },
  { id: 'natore', name: 'Natore', division: 'Rajshahi', lat: 24.4102, lng: 88.9834, risk: 'Moderate', severity: 0.54, hazardType: 'Monsoon Flood', mainCrop: 'Sugarcane & Garlic', elevationMeters: 17, cx: 33, cy: 42 },
  { id: 'chapainawabganj', name: 'Chapainawabganj', division: 'Rajshahi', lat: 24.5965, lng: 88.2775, risk: 'High', severity: 0.72, hazardType: 'Drought', mainCrop: 'Mango & Wheat', elevationMeters: 21, cx: 20, cy: 38 },
  { id: 'joypurhat', name: 'Joypurhat', division: 'Rajshahi', lat: 25.1013, lng: 89.0267, risk: 'Low', severity: 0.36, hazardType: 'Drought', mainCrop: 'Potato & Rice', elevationMeters: 25, cx: 33, cy: 28 },

  // --- 3. MYMENSINGH DIVISION (4 Districts) ---
  { id: 'mymensingh', name: 'Mymensingh', division: 'Mymensingh', lat: 24.7471, lng: 90.4203, risk: 'Moderate', severity: 0.63, hazardType: 'Monsoon Flood', mainCrop: 'Boro Rice & Inland Fish', elevationMeters: 19, cx: 58, cy: 34 },
  { id: 'netrokona', name: 'Netrokona', division: 'Mymensingh', lat: 24.8800, lng: 90.7300, risk: 'High', severity: 0.86, hazardType: 'Flash Flood', mainCrop: 'Haor Boro Rice', elevationMeters: 10, cx: 64, cy: 32 },
  { id: 'jamalpur', name: 'Jamalpur', division: 'Mymensingh', lat: 24.9375, lng: 89.9378, risk: 'High', severity: 0.78, hazardType: 'Monsoon Flood', mainCrop: 'Jute & Mustard', elevationMeters: 21, cx: 50, cy: 32 },
  { id: 'sherpur', name: 'Sherpur', division: 'Mymensingh', lat: 25.0205, lng: 90.0153, risk: 'Moderate', severity: 0.59, hazardType: 'Flash Flood', mainCrop: 'Aman Paddy & Vegetables', elevationMeters: 23, cx: 51, cy: 26 },

  // --- 4. SYLHET DIVISION (4 Districts) ---
  { id: 'sylhet', name: 'Sylhet', division: 'Sylhet', lat: 24.8949, lng: 91.8687, risk: 'High', severity: 0.82, hazardType: 'Flash Flood', mainCrop: 'Tea Gardens & Boro Paddy', elevationMeters: 15, cx: 82, cy: 31 },
  { id: 'sunamganj', name: 'Sunamganj', division: 'Sylhet', lat: 25.0658, lng: 91.3950, risk: 'High', severity: 0.94, hazardType: 'Flash Flood', mainCrop: 'Boro Paddy (Haor Basin)', elevationMeters: 8, cx: 72, cy: 28 },
  { id: 'habiganj', name: 'Habiganj', division: 'Sylhet', lat: 24.3749, lng: 91.4168, risk: 'High', severity: 0.81, hazardType: 'Flash Flood', mainCrop: 'Boro Rice & Tea', elevationMeters: 11, cx: 73, cy: 42 },
  { id: 'moulvibazar', name: 'Moulvibazar', division: 'Sylhet', lat: 24.4829, lng: 91.7774, risk: 'Moderate', severity: 0.68, hazardType: 'Flash Flood', mainCrop: 'Tea & Citrus (Satkara)', elevationMeters: 18, cx: 80, cy: 40 },

  // --- 5. DHAKA DIVISION (13 Districts) ---
  { id: 'dhaka', name: 'Dhaka', division: 'Dhaka', lat: 23.8103, lng: 90.4125, risk: 'Moderate', severity: 0.45, hazardType: 'Monsoon Flood', mainCrop: 'Peri-urban Horticulture', elevationMeters: 12, cx: 58, cy: 53 },
  { id: 'gazipur', name: 'Gazipur', division: 'Dhaka', lat: 24.0023, lng: 90.4264, risk: 'Low', severity: 0.39, hazardType: 'Monsoon Flood', mainCrop: 'Vegetables & Guava', elevationMeters: 16, cx: 58, cy: 48 },
  { id: 'narayanganj', name: 'Narayanganj', division: 'Dhaka', lat: 23.6238, lng: 90.5000, risk: 'Moderate', severity: 0.47, hazardType: 'Monsoon Flood', mainCrop: 'Paddy & Jute', elevationMeters: 8, cx: 60, cy: 57 },
  { id: 'tangail', name: 'Tangail', division: 'Dhaka', lat: 24.2513, lng: 89.9167, risk: 'Moderate', severity: 0.57, hazardType: 'Monsoon Flood', mainCrop: 'Pineapple & Banana', elevationMeters: 14, cx: 50, cy: 45 },
  { id: 'kishoreganj', name: 'Kishoreganj', division: 'Dhaka', lat: 24.4449, lng: 90.7766, risk: 'High', severity: 0.77, hazardType: 'Flash Flood', mainCrop: 'Haor Boro Paddy', elevationMeters: 11, cx: 65, cy: 41 },
  { id: 'manikganj', name: 'Manikganj', division: 'Dhaka', lat: 23.8644, lng: 90.0047, risk: 'Moderate', severity: 0.62, hazardType: 'Monsoon Flood', mainCrop: 'Mustard & Tobacco', elevationMeters: 10, cx: 51, cy: 52 },
  { id: 'munshiganj', name: 'Munshiganj', division: 'Dhaka', lat: 23.5422, lng: 90.5305, risk: 'Moderate', severity: 0.53, hazardType: 'Monsoon Flood', mainCrop: 'Potato & Banana', elevationMeters: 7, cx: 60, cy: 60 },
  { id: 'narsingdi', name: 'Narsingdi', division: 'Dhaka', lat: 23.9193, lng: 90.7201, risk: 'Low', severity: 0.41, hazardType: 'Monsoon Flood', mainCrop: 'Banana & Vegetables', elevationMeters: 12, cx: 63, cy: 50 },
  { id: 'faridpur', name: 'Faridpur', division: 'Dhaka', lat: 23.6071, lng: 89.8406, risk: 'High', severity: 0.74, hazardType: 'Monsoon Flood', mainCrop: 'Jute & Onion', elevationMeters: 9, cx: 48, cy: 58 },
  { id: 'gopalganj', name: 'Gopalganj', division: 'Dhaka', lat: 23.0051, lng: 89.8266, risk: 'Moderate', severity: 0.65, hazardType: 'Monsoon Flood', mainCrop: 'Paddy & Aquaculture', elevationMeters: 5, cx: 48, cy: 68 },
  { id: 'madaripur', name: 'Madaripur', division: 'Dhaka', lat: 23.1641, lng: 90.1897, risk: 'Moderate', severity: 0.64, hazardType: 'Monsoon Flood', mainCrop: 'Jute & Mustard', elevationMeters: 6, cx: 54, cy: 65 },
  { id: 'rajbari', name: 'Rajbari', division: 'Dhaka', lat: 23.7574, lng: 89.6444, risk: 'High', severity: 0.71, hazardType: 'Monsoon Flood', mainCrop: 'Jute & Sugarcane', elevationMeters: 11, cx: 45, cy: 55 },
  { id: 'shariatpur', name: 'Shariatpur', division: 'Dhaka', lat: 23.2423, lng: 90.4348, risk: 'High', severity: 0.73, hazardType: 'Monsoon Flood', mainCrop: 'Chili & Paddy', elevationMeters: 5, cx: 58, cy: 64 },

  // --- 6. KHULNA DIVISION (10 Districts) ---
  { id: 'khulna', name: 'Khulna', division: 'Khulna', lat: 22.8456, lng: 89.5403, risk: 'High', severity: 0.76, hazardType: 'Tropical Cyclone', mainCrop: 'Sesame & Paddy', elevationMeters: 6, cx: 42, cy: 70 },
  { id: 'satkhira', name: 'Satkhira', division: 'Khulna', lat: 22.7185, lng: 89.0705, risk: 'High', severity: 0.89, hazardType: 'Tropical Cyclone', mainCrop: 'Shrimp Farming & Saline Rice', elevationMeters: 4, cx: 34, cy: 73 },
  { id: 'bagerhat', name: 'Bagerhat', division: 'Khulna', lat: 22.6516, lng: 89.7859, risk: 'High', severity: 0.83, hazardType: 'Tropical Cyclone', mainCrop: 'Coconut & Betel Nut', elevationMeters: 5, cx: 47, cy: 74 },
  { id: 'jessore', name: 'Jessore', division: 'Khulna', lat: 23.1664, lng: 89.2081, risk: 'Moderate', severity: 0.52, hazardType: 'Drought', mainCrop: 'Flower Cultivation & Date Palm', elevationMeters: 12, cx: 36, cy: 64 },
  { id: 'jhenaidah', name: 'Jhenaidah', division: 'Khulna', lat: 23.5448, lng: 89.1539, risk: 'Moderate', severity: 0.48, hazardType: 'Drought', mainCrop: 'Banana & Vegetables', elevationMeters: 14, cx: 36, cy: 58 },
  { id: 'magura', name: 'Magura', division: 'Khulna', lat: 23.4873, lng: 89.4199, risk: 'Moderate', severity: 0.55, hazardType: 'Monsoon Flood', mainCrop: 'Mustard & Jute', elevationMeters: 11, cx: 41, cy: 59 },
  { id: 'narail', name: 'Narail', division: 'Khulna', lat: 23.1725, lng: 89.5126, risk: 'Moderate', severity: 0.58, hazardType: 'Monsoon Flood', mainCrop: 'Paddy & Pulses', elevationMeters: 8, cx: 42, cy: 64 },
  { id: 'chuadanga', name: 'Chuadanga', division: 'Khulna', lat: 23.6402, lng: 88.8418, risk: 'Moderate', severity: 0.51, hazardType: 'Drought', mainCrop: 'Corn & Sugarcane', elevationMeters: 16, cx: 31, cy: 56 },
  { id: 'kushtia', name: 'Kushtia', division: 'Khulna', lat: 23.9013, lng: 89.1205, risk: 'Moderate', severity: 0.53, hazardType: 'Drought', mainCrop: 'Tobacco & Sesame', elevationMeters: 15, cx: 35, cy: 52 },
  { id: 'meherpur', name: 'Meherpur', division: 'Khulna', lat: 23.7622, lng: 88.6318, risk: 'Low', severity: 0.44, hazardType: 'Drought', mainCrop: 'Garlic & Corn', elevationMeters: 18, cx: 28, cy: 54 },

  // --- 7. BARISHAL DIVISION (6 Districts) ---
  { id: 'barisal', name: 'Barisal', division: 'Barisal', lat: 22.7010, lng: 90.3535, risk: 'Moderate', severity: 0.62, hazardType: 'Monsoon Flood', mainCrop: 'Betel Leaf & Paddy', elevationMeters: 3, cx: 56, cy: 72 },
  { id: 'bhola', name: 'Bhola', division: 'Barisal', lat: 22.6859, lng: 90.6481, risk: 'High', severity: 0.87, hazardType: 'Tropical Cyclone', mainCrop: 'Watermelon & Buffalo Milk', elevationMeters: 2, cx: 62, cy: 73 },
  { id: 'jhalokati', name: 'Jhalokati', division: 'Barisal', lat: 22.6406, lng: 90.1987, risk: 'Moderate', severity: 0.59, hazardType: 'Monsoon Flood', mainCrop: 'Guava & Betel Leaf', elevationMeters: 3, cx: 53, cy: 73 },
  { id: 'patuakhali', name: 'Patuakhali', division: 'Barisal', lat: 22.3596, lng: 90.3298, risk: 'High', severity: 0.84, hazardType: 'Tropical Cyclone', mainCrop: 'Watermelon & Saline Rice', elevationMeters: 2, cx: 56, cy: 78 },
  { id: 'pirojpur', name: 'Pirojpur', division: 'Barisal', lat: 22.5841, lng: 89.9720, risk: 'Moderate', severity: 0.64, hazardType: 'Tropical Cyclone', mainCrop: 'Coconut & Amada', elevationMeters: 3, cx: 50, cy: 73 },
  { id: 'barguna', name: 'Barguna', division: 'Barisal', lat: 22.1570, lng: 90.1228, risk: 'High', severity: 0.88, hazardType: 'Tropical Cyclone', mainCrop: 'Pulses & Saline Rice', elevationMeters: 1, cx: 52, cy: 82 },

  // --- 8. CHATTOGRAM DIVISION (11 Districts) ---
  { id: 'chattogram', name: 'Chattogram', division: 'Chattogram', lat: 22.3569, lng: 91.7832, risk: 'High', severity: 0.79, hazardType: 'Tropical Cyclone', mainCrop: 'Vegetables & Paddy', elevationMeters: 10, cx: 81, cy: 78 },
  { id: 'coxsbazar', name: 'Cox\'s Bazar', division: 'Chattogram', lat: 21.4272, lng: 92.0058, risk: 'High', severity: 0.91, hazardType: 'Tropical Cyclone', mainCrop: 'Betel Leaf & Salt Agriculture', elevationMeters: 5, cx: 86, cy: 88 },
  { id: 'cumilla', name: 'Cumilla', division: 'Chattogram', lat: 23.4607, lng: 91.1809, risk: 'Moderate', severity: 0.56, hazardType: 'Monsoon Flood', mainCrop: 'Paddy & Vegetables', elevationMeters: 12, cx: 70, cy: 59 },
  { id: 'feni', name: 'Feni', division: 'Chattogram', lat: 23.0159, lng: 91.3976, risk: 'High', severity: 0.76, hazardType: 'Flash Flood', mainCrop: 'Paddy & Watermelon', elevationMeters: 8, cx: 74, cy: 67 },
  { id: 'noakhali', name: 'Noakhali', division: 'Chattogram', lat: 22.8696, lng: 91.0995, risk: 'High', severity: 0.81, hazardType: 'Tropical Cyclone', mainCrop: 'Soybean & Coconut', elevationMeters: 4, cx: 69, cy: 70 },
  { id: 'lakshmipur', name: 'Lakshmipur', division: 'Chattogram', lat: 22.9425, lng: 90.8411, risk: 'High', severity: 0.78, hazardType: 'Tropical Cyclone', mainCrop: 'Soybean & Betel Nut', elevationMeters: 4, cx: 65, cy: 68 },
  { id: 'chandpur', name: 'Chandpur', division: 'Chattogram', lat: 23.2333, lng: 90.6667, risk: 'High', severity: 0.72, hazardType: 'Monsoon Flood', mainCrop: 'Hilsa Fishing & Paddy', elevationMeters: 5, cx: 62, cy: 64 },
  { id: 'brahmanbaria', name: 'Brahmanbaria', division: 'Chattogram', lat: 23.9571, lng: 91.1119, risk: 'Moderate', severity: 0.61, hazardType: 'Flash Flood', mainCrop: 'Mustard & Paddy', elevationMeters: 10, cx: 69, cy: 50 },
  { id: 'khagrachhari', name: 'Khagrachhari', division: 'Chattogram', lat: 23.1193, lng: 91.9847, risk: 'Moderate', severity: 0.54, hazardType: 'Severe Storm', mainCrop: 'Turmeric & Fruits', elevationMeters: 110, cx: 84, cy: 65 },
  { id: 'rangamati', name: 'Rangamati', division: 'Chattogram', lat: 22.6533, lng: 92.1753, risk: 'Moderate', severity: 0.59, hazardType: 'Severe Storm', mainCrop: 'Cotton & Pineapple', elevationMeters: 140, cx: 88, cy: 73 },
  { id: 'bandarban', name: 'Bandarban', division: 'Chattogram', lat: 21.8311, lng: 92.3686, risk: 'Moderate', severity: 0.52, hazardType: 'Severe Storm', mainCrop: 'Coffee & Broom Grass', elevationMeters: 230, cx: 90, cy: 84 }
];

// Official Dataset for All 8 Administrative Divisions of Bangladesh
export const ALL_8_DIVISIONS: DivisionData[] = [
  {
    id: 'rangpur',
    name: 'Rangpur Division',
    capital: 'Rangpur',
    districtCount: 8,
    lat: 25.7439,
    lng: 89.2752,
    avgSeverity: 0.63,
    primaryHazard: 'Monsoon Flood & Cold Wave',
    path: 'M 15,4 L 50,8 L 54,26 L 38,28 L 15,22 Z',
    fill: 'rgba(255, 255, 255, 0.22)',
    stroke: '#ffffff',
    cx: 33,
    cy: 16
  },
  {
    id: 'rajshahi',
    name: 'Rajshahi Division',
    capital: 'Rajshahi',
    districtCount: 8,
    lat: 24.3745,
    lng: 88.6042,
    avgSeverity: 0.58,
    primaryHazard: 'Barind Agricultural Drought',
    path: 'M 15,22 L 38,28 L 50,44 L 38,52 L 15,48 Z',
    fill: 'rgba(194, 194, 194, 0.18)',
    stroke: '#c2c2c2',
    cx: 31,
    cy: 38
  },
  {
    id: 'mymensingh',
    name: 'Mymensingh Division',
    capital: 'Mymensingh',
    districtCount: 4,
    lat: 24.7471,
    lng: 90.4203,
    avgSeverity: 0.72,
    primaryHazard: 'Flash Flood & River Inundation',
    path: 'M 50,8 L 68,10 L 66,36 L 48,36 Z',
    fill: 'rgba(255, 255, 255, 0.18)',
    stroke: '#ffffff',
    cx: 56,
    cy: 28
  },
  {
    id: 'sylhet',
    name: 'Sylhet Division',
    capital: 'Sylhet',
    districtCount: 4,
    lat: 24.8949,
    lng: 91.8687,
    avgSeverity: 0.85,
    primaryHazard: 'Pre-Monsoon Haor Flash Flood',
    path: 'M 68,10 L 92,12 L 94,44 L 68,44 L 66,36 Z',
    fill: 'rgba(255, 255, 255, 0.25)',
    stroke: '#ffffff',
    cx: 78,
    cy: 32
  },
  {
    id: 'dhaka',
    name: 'Dhaka Division',
    capital: 'Dhaka',
    districtCount: 13,
    lat: 23.8103,
    lng: 90.4125,
    avgSeverity: 0.57,
    primaryHazard: 'Monsoon Flood & Urban Inundation',
    path: 'M 38,52 L 50,44 L 68,44 L 68,66 L 44,68 Z',
    fill: 'rgba(120, 120, 120, 0.18)',
    stroke: '#787878',
    cx: 55,
    cy: 55
  },
  {
    id: 'khulna',
    name: 'Khulna Division',
    capital: 'Khulna',
    districtCount: 10,
    lat: 22.8456,
    lng: 89.5403,
    avgSeverity: 0.62,
    primaryHazard: 'Tropical Cyclone & Saline Intrusion',
    path: 'M 22,50 L 44,52 L 48,78 L 26,82 L 20,68 Z',
    fill: 'rgba(194, 194, 194, 0.18)',
    stroke: '#c2c2c2',
    cx: 36,
    cy: 66
  },
  {
    id: 'barisal',
    name: 'Barisal Division',
    capital: 'Barisal',
    districtCount: 6,
    lat: 22.7010,
    lng: 90.3535,
    avgSeverity: 0.74,
    primaryHazard: 'Coastal Storm Surge & Monsoons',
    path: 'M 48,66 L 66,66 L 66,84 L 48,84 Z',
    fill: 'rgba(255, 255, 255, 0.20)',
    stroke: '#ffffff',
    cx: 56,
    cy: 75
  },
  {
    id: 'chattogram',
    name: 'Chattogram Division',
    capital: 'Chattogram',
    districtCount: 11,
    lat: 22.3569,
    lng: 91.7832,
    avgSeverity: 0.71,
    primaryHazard: 'Coastal Cyclone & Hill Flash Flood',
    path: 'M 68,44 L 94,44 L 96,76 L 92,96 L 66,84 L 68,66 Z',
    fill: 'rgba(255, 255, 255, 0.22)',
    stroke: '#ffffff',
    cx: 80,
    cy: 70
  }
];

// Helper to lookup any district by ID
export function getDistrictById(id: string): DistrictData | undefined {
  return ALL_64_DISTRICTS.find((d) => d.id === id.toLowerCase());
}

// Helper to lookup division by name
export function getDivisionByName(name: string): DivisionData | undefined {
  return ALL_8_DIVISIONS.find((div) => div.name.toLowerCase().includes(name.toLowerCase()));
}
