/**
 * Coordinates and AEZ metadata for all 64 districts of Bangladesh.
 * Used by Google Maps Grounding (toolConfig.retrievalConfig.latLng)
 * to provide accurate spatial context.
 */

export const DISTRICT_COORDINATES = {
  // Rangpur Division
  kurigram: { name: 'Kurigram', division: 'Rangpur', lat: 25.8058, lng: 89.6361 },
  rangpur: { name: 'Rangpur', division: 'Rangpur', lat: 25.7439, lng: 89.2752 },
  gaibandha: { name: 'Gaibandha', division: 'Rangpur', lat: 25.3288, lng: 89.5403 },
  nilphamari: { name: 'Nilphamari', division: 'Rangpur', lat: 25.9312, lng: 88.8560 },
  dinajpur: { name: 'Dinajpur', division: 'Rangpur', lat: 25.6279, lng: 88.6332 },
  panchagarh: { name: 'Panchagarh', division: 'Rangpur', lat: 26.3411, lng: 88.5541 },
  thakurgaon: { name: 'Thakurgaon', division: 'Rangpur', lat: 26.0337, lng: 88.4617 },
  lalmonirhat: { name: 'Lalmonirhat', division: 'Rangpur', lat: 25.9165, lng: 89.4532 },

  // Rajshahi Division
  rajshahi: { name: 'Rajshahi', division: 'Rajshahi', lat: 24.3745, lng: 88.6042 },
  bogra: { name: 'Bogra', division: 'Rajshahi', lat: 24.8481, lng: 89.3730 },
  sirajganj: { name: 'Sirajganj', division: 'Rajshahi', lat: 24.4534, lng: 89.7008 },
  pabna: { name: 'Pabna', division: 'Rajshahi', lat: 24.0064, lng: 89.2372 },
  naogaon: { name: 'Naogaon', division: 'Rajshahi', lat: 24.8103, lng: 88.9414 },
  natore: { name: 'Natore', division: 'Rajshahi', lat: 24.4102, lng: 88.9834 },
  chapainawabganj: { name: 'Chapainawabganj', division: 'Rajshahi', lat: 24.5965, lng: 88.2775 },
  joypurhat: { name: 'Joypurhat', division: 'Rajshahi', lat: 25.1013, lng: 89.0267 },

  // Mymensingh Division
  mymensingh: { name: 'Mymensingh', division: 'Mymensingh', lat: 24.7471, lng: 90.4203 },
  netrokona: { name: 'Netrokona', division: 'Mymensingh', lat: 24.8800, lng: 90.7300 },
  jamalpur: { name: 'Jamalpur', division: 'Mymensingh', lat: 24.9375, lng: 89.9378 },
  sherpur: { name: 'Sherpur', division: 'Mymensingh', lat: 25.0205, lng: 90.0153 },

  // Sylhet Division
  sylhet: { name: 'Sylhet', division: 'Sylhet', lat: 24.8949, lng: 91.8687 },
  sunamganj: { name: 'Sunamganj', division: 'Sylhet', lat: 25.0658, lng: 91.3950 },
  habiganj: { name: 'Habiganj', division: 'Sylhet', lat: 24.3749, lng: 91.4168 },
  moulvibazar: { name: 'Moulvibazar', division: 'Sylhet', lat: 24.4829, lng: 91.7774 },

  // Dhaka Division
  dhaka: { name: 'Dhaka', division: 'Dhaka', lat: 23.8103, lng: 90.4125 },
  gazipur: { name: 'Gazipur', division: 'Dhaka', lat: 24.0023, lng: 90.4264 },
  narayanganj: { name: 'Narayanganj', division: 'Dhaka', lat: 23.6238, lng: 90.5000 },
  tangail: { name: 'Tangail', division: 'Dhaka', lat: 24.2513, lng: 89.9167 },
  kishoreganj: { name: 'Kishoreganj', division: 'Dhaka', lat: 24.4449, lng: 90.7766 },
  manikganj: { name: 'Manikganj', division: 'Dhaka', lat: 23.8644, lng: 90.0047 },
  munshiganj: { name: 'Munshiganj', division: 'Dhaka', lat: 23.5422, lng: 90.5305 },
  narsingdi: { name: 'Narsingdi', division: 'Dhaka', lat: 23.9193, lng: 90.7201 },
  faridpur: { name: 'Faridpur', division: 'Dhaka', lat: 23.6071, lng: 89.8406 },
  gopalganj: { name: 'Gopalganj', division: 'Dhaka', lat: 23.0051, lng: 89.8266 },
  madaripur: { name: 'Madaripur', division: 'Dhaka', lat: 23.1641, lng: 90.1897 },
  rajbari: { name: 'Rajbari', division: 'Dhaka', lat: 23.7574, lng: 89.6444 },
  shariatpur: { name: 'Shariatpur', division: 'Dhaka', lat: 23.2423, lng: 90.4348 },

  // Khulna Division
  khulna: { name: 'Khulna', division: 'Khulna', lat: 22.8456, lng: 89.5403 },
  satkhira: { name: 'Satkhira', division: 'Khulna', lat: 22.7185, lng: 89.0705 },
  bagerhat: { name: 'Bagerhat', division: 'Khulna', lat: 22.6516, lng: 89.7859 },
  jessore: { name: 'Jashore', division: 'Khulna', lat: 23.1664, lng: 89.2081 },
  jhenaidah: { name: 'Jhenaidah', division: 'Khulna', lat: 23.5448, lng: 89.1539 },
  magura: { name: 'Magura', division: 'Khulna', lat: 23.4873, lng: 89.4199 },
  narail: { name: 'Narail', division: 'Khulna', lat: 23.1725, lng: 89.5126 },
  chuadanga: { name: 'Chuadanga', division: 'Khulna', lat: 23.6402, lng: 88.8418 },
  kushtia: { name: 'Kushtia', division: 'Khulna', lat: 23.9013, lng: 89.1205 },
  meherpur: { name: 'Meherpur', division: 'Khulna', lat: 23.7622, lng: 88.6318 },

  // Barisal Division
  barisal: { name: 'Barisal', division: 'Barisal', lat: 22.7010, lng: 90.3535 },
  bhola: { name: 'Bhola', division: 'Barisal', lat: 22.6859, lng: 90.6481 },
  jhalokati: { name: 'Jhalokati', division: 'Barisal', lat: 22.6406, lng: 90.1987 },
  patuakhali: { name: 'Patuakhali', division: 'Barisal', lat: 22.3596, lng: 90.3298 },
  pirojpur: { name: 'Pirojpur', division: 'Barisal', lat: 22.5841, lng: 89.9720 },
  barguna: { name: 'Barguna', division: 'Barisal', lat: 22.1570, lng: 90.1228 },

  // Chattogram Division
  chattogram: { name: 'Chattogram', division: 'Chattogram', lat: 22.3569, lng: 91.7832 },
  coxsbazar: { name: "Cox's Bazar", division: 'Chattogram', lat: 21.4272, lng: 92.0058 },
  cumilla: { name: 'Cumilla', division: 'Chattogram', lat: 23.4607, lng: 91.1809 },
  feni: { name: 'Feni', division: 'Chattogram', lat: 23.0159, lng: 91.3976 },
  noakhali: { name: 'Noakhali', division: 'Chattogram', lat: 22.8696, lng: 91.0995 },
  lakshmipur: { name: 'Lakshmipur', division: 'Chattogram', lat: 22.9425, lng: 90.8411 },
  chandpur: { name: 'Chandpur', division: 'Chattogram', lat: 23.2333, lng: 90.6667 },
  brahmanbaria: { name: 'Brahmanbaria', division: 'Chattogram', lat: 23.9571, lng: 91.1119 },
  khagrachhari: { name: 'Khagrachhari', division: 'Chattogram', lat: 23.1193, lng: 91.9847 },
  rangamati: { name: 'Rangamati', division: 'Chattogram', lat: 22.6533, lng: 92.1753 },
  bandarban: { name: 'Bandarban', division: 'Chattogram', lat: 21.8311, lng: 92.3686 }
};

/**
 * Resolve latLng for a district name or id.
 * Defaults to Bangladesh geographic center (Dhaka) if unknown.
 */
export function getDistrictCoordinates(districtInput) {
  if (!districtInput) {
    return { latitude: 23.8103, longitude: 90.4125, name: 'Bangladesh' };
  }

  const clean = String(districtInput).toLowerCase().replace(/[^a-z]/g, '');

  for (const [key, val] of Object.entries(DISTRICT_COORDINATES)) {
    const keyClean = key.replace(/[^a-z]/g, '');
    const nameClean = val.name.toLowerCase().replace(/[^a-z]/g, '');
    if (clean === keyClean || clean === nameClean || clean.includes(keyClean) || keyClean.includes(clean)) {
      return { latitude: val.lat, longitude: val.lng, name: val.name, division: val.division };
    }
  }

  return { latitude: 23.8103, longitude: 90.4125, name: districtInput };
}
