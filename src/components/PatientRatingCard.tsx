import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '../supabase';
import PatientGuidanceNotice from './PatientGuidanceNotice';

type PatientRatingCardProps = {
  guidanceNoticeText: string;
  practiceIdentifier: string;
};

const PatientRatingCard: React.FC<PatientRatingCardProps> = ({ guidanceNoticeText, practiceIdentifier }) => {
  const [rating, setRating] = useState(0);
  const [hasRated, setHasRated] = useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const handleRating = async (value: number) => {
    if (hasRated || !practiceIdentifier) return;
    setRating(value);
    setRatingError(null);
    setIsSubmittingRating(true);
    try {
      const { data, error } = await supabase.rpc('submit_patient_rating', {
        org_name: practiceIdentifier,
        rating_value: value,
      });
      if (error) {
        throw error;
      }
      const result = data as { success?: boolean; error?: string } | null;
      if (result && result.success === false) {
        setRatingError(result.error || 'Unable to submit rating. Please try again later.');
        setRating(0);
      } else {
        setHasRated(true);
      }
    } catch (err) {
      console.error('Failed to submit rating:', err);
      setRatingError('Unable to submit rating. Please try again later.');
      setRating(0);
    }
    setIsSubmittingRating(false);
  };

  return (
    <>
      <div className="card hc-rating" style={{ marginTop: '2rem', textAlign: 'center', padding: '2rem 1rem' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#212b32' }}>Did you find this information useful?</h2>
        {hasRated ? (
          <div style={{ color: '#007f3b', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '1rem' }}>Thank you for your feedback!</div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRating(star)}
                disabled={isSubmittingRating}
                aria-label={`Rate ${star} out of 5 stars${rating === star ? ', selected' : ''}`}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: isSubmittingRating ? 'default' : 'pointer',
                  padding: '0.5rem',
                  opacity: isSubmittingRating ? 0.5 : 1,
                  transition: 'transform 0.2s',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isSubmittingRating) {
                    const buttons = e.currentTarget.parentElement?.querySelectorAll('button');
                    if (buttons) {
                      for (let i = 0; i < 5; i += 1) {
                        const svg = buttons[i].querySelector('svg');
                        if (svg) svg.style.fill = i <= star - 1 ? '#fbc02d' : 'none';
                        if (svg) svg.style.stroke = i <= star - 1 ? '#fbc02d' : '#8A99A8';
                      }
                    }
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmittingRating) {
                    const buttons = e.currentTarget.parentElement?.querySelectorAll('button');
                    if (buttons) {
                      for (let i = 0; i < 5; i += 1) {
                        const svg = buttons[i].querySelector('svg');
                        if (svg) svg.style.fill = i <= rating - 1 ? '#fbc02d' : 'none';
                        if (svg) svg.style.stroke = i <= rating - 1 ? '#fbc02d' : '#8A99A8';
                      }
                    }
                  }
                }}
              >
                <Star
                  size={36}
                  color={star <= rating ? '#fbc02d' : '#8A99A8'}
                  fill={star <= rating ? '#fbc02d' : 'none'}
                />
              </button>
            ))}
          </div>
        )}
        {ratingError && !hasRated && (
          <p role="alert" style={{ marginTop: '1rem', color: '#d5281b', fontSize: '0.95rem' }}>
            {ratingError}
          </p>
        )}
      </div>

      <div className="hc-rating__notice">
        <PatientGuidanceNotice text={guidanceNoticeText} />
      </div>
    </>
  );
};

export default PatientRatingCard;
