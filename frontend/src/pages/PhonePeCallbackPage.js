import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import apiRequest from '../utils/api';
import { useAlert } from '../hooks/useAlert';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../hooks/useCart';

function PhonePeCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showAlert } = useAlert();
  const { isLoggedIn } = useAuth();
  const { clearCart } = useCart();
  const [status, setStatus] = useState('Verifying your PhonePe payment...');
  const [error, setError] = useState('');

  const merchantOrderId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('merchantOrderId') || '').trim();
  }, [location.search]);

  useEffect(() => {
    if (!isLoggedIn) {
      showAlert('Please log in to verify your payment.', 'error');
      navigate('/login');
    }
  }, [isLoggedIn, navigate, showAlert]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!merchantOrderId) {
      setError('Missing merchant order id in callback URL.');
      setStatus('Unable to verify payment.');
      return;
    }

    let cancelled = false;
    const verifyPayment = async () => {
      try {
        setStatus('Verifying payment with PhonePe...');
        const result = await apiRequest('/orders/phonepe/confirm', 'POST', { merchantOrderId });
        if (cancelled) return;
        clearCart();
        setStatus('Payment successful. Redirecting to order status...');
        showAlert('PhonePe payment successful. Order placed!', 'success');
        const orderId = result?.orderId;
        if (orderId) {
          navigate(`/status/${orderId}`);
        } else {
          navigate('/orders');
        }
      } catch (verifyError) {
        if (cancelled) return;
        setError(verifyError.message || 'Payment verification failed.');
        setStatus('Payment verification failed.');
      }
    };

    verifyPayment();
    return () => {
      cancelled = true;
    };
  }, [clearCart, isLoggedIn, merchantOrderId, navigate, showAlert]);

  return (
    <main className="container">
      <h2>PhonePe Payment</h2>
      <div className="auth-card" style={{ maxWidth: '640px' }}>
        <p>{status}</p>
        {error && (
          <>
            <p style={{ color: '#b3261e' }}>{error}</p>
            <div className="cart-summary-actions">
              <Link to="/cart" className="button">Back to Cart</Link>
              <Link to="/orders" className="button">View Orders</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default PhonePeCallbackPage;
