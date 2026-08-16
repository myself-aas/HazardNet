import { useEffect, useState } from 'react';
import { useAuth, UserAssessment } from '../context/AuthContext';
import { SavedAssessmentsModalUI } from './SavedAssessmentsModalUI';

interface SavedAssessmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDistrict?: (districtId: string) => void;
}

export const SavedAssessmentsModal: React.FC<SavedAssessmentsModalProps> = ({
  isOpen,
  onClose,
  onSelectDistrict,
}) => {
  const { user, fetchUserAssessments, deleteAssessment } = useAuth();
  const [assessments, setAssessments] = useState<UserAssessment[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchUserAssessments();
      setAssessments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && user) {
      loadData();
    }
  }, [isOpen, user]);

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this saved assessment record from Firestore?')) {
      await deleteAssessment(id);
      setAssessments((prev) => prev.filter((item) => item.id !== id));
    }
  };

  return (
    <SavedAssessmentsModalUI
      isOpen={isOpen}
      loading={loading}
      assessments={assessments}
      onClose={onClose}
      onSelectDistrict={onSelectDistrict}
      onDelete={handleDelete}
    />
  );
};
;
