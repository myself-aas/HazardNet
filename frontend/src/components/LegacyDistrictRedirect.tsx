import { Navigate, useLocation, useParams } from 'react-router-dom';
export function LegacyDistrictRedirect() {
  const { id = '' } = useParams(); const location = useLocation();
  return <Navigate replace to={`/forecast/district/${encodeURIComponent(id)}${location.search}`} />;
}
