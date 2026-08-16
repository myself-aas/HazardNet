sed -i 's/onClick={() => if (selectedDistrict) runPrediction(selectedDistrict)}/onClick={() => { if (selectedDistrict) runPrediction(selectedDistrict); }}/g' frontend/src/pages/Dashboard.tsx
