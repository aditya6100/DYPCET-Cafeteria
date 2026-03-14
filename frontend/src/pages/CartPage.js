import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../hooks/useCart';
import { useAlert } from '../hooks/useAlert';
import apiRequest from '../utils/api';

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

// Dynamically load Razorpay script only once.
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

function CartPage() {
  const { isLoggedIn, user } = useAuth();
  const { cart, cartTotal, removeFromCart, updateItemQuantity, clearCart } = useCart();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [orderInstruction, setOrderInstruction] = useState('');
  const [orderPause, setOrderPause] = useState({ is_paused_now: false, message: '' });
  const [paymentMode, setPaymentMode] = useState('online'); // online | cash
  const [guestName, setGuestName] = useState('');
  const [guestMobile, setGuestMobile] = useState('');
  const [showCashDetailsModal, setShowCashDetailsModal] = useState(false);

  const totalAmountWithTaxes = cartTotal;

  // Cart supports guest checkout (cash), so do not force-login on page load.

  useEffect(() => {
    const fetchPause = async () => {
      try {
        const data = await apiRequest('/menu/order-pause');
        setOrderPause({
          is_paused_now: Boolean(data?.is_paused_now),
          message: String(data?.message || '').trim()
        });
      } catch (_error) {
        setOrderPause({ is_paused_now: false, message: '' });
      }
    };

    fetchPause();
  }, []);

  const changeQuantityBy = (item, delta) => {
    const next = Number(item.quantity || 0) + delta;
    if (next <= 0) {
      removeFromCart(item.id);
      return;
    }
    updateItemQuantity(item.id, next);
  };

  const handlePayment = async () => {
    if (cart.length === 0) {
      showAlert('Your cart is empty!', 'error');
      return;
    }

    try {
      const pause = await apiRequest('/menu/order-pause');
      if (pause?.is_paused_now) {
        showAlert(String(pause?.message || 'Ordering is temporarily paused. Please try again later.'), 'error');
        return;
      }
    } catch (_error) {
      // If pause settings cannot be fetched, continue and let the server validate.
    }

    if (paymentMode === 'online' && !isLoggedIn) {
      showAlert('Please log in to pay online.', 'error');
      navigate('/login');
      return;
    }

    const instructionInput = window.prompt(
      'Any instruction for your order? (optional)\nExamples: less spicy, no onion, extra sauce',
      orderInstruction
    );
    if (instructionInput === null) {
      return;
    }
    const normalizedInstruction = String(instructionInput || '').trim().slice(0, 500);
    setOrderInstruction(normalizedInstruction);

    if (paymentMode === 'cash') {
      const trimmedName = String((isLoggedIn ? user?.name : guestName) || '').trim();
      const mobileDigits = String((isLoggedIn ? user?.mobile_no : guestMobile) || '').replace(/\D/g, '').slice(-10);

      if (!trimmedName) {
        if (isLoggedIn) {
          showAlert('Your profile name is missing. Please update your profile to place a cash order.', 'error');
          navigate('/profile');
          return;
        }
        setShowCashDetailsModal(true);
        return;
      }
      if (!/^\d{10}$/.test(mobileDigits)) {
        if (isLoggedIn) {
          showAlert('Your profile mobile number is missing/invalid. Please update your profile to place a cash order.', 'error');
          navigate('/profile');
          return;
        }
        setShowCashDetailsModal(true);
        return;
      }

      setIsProcessingPayment(true);
      try {
        const payload = {
          items: cart,
          total_amount: totalAmountWithTaxes,
          order_instruction: normalizedInstruction
        };
        if (!isLoggedIn) {
          payload.customer_name = trimmedName;
          payload.customer_mobile = mobileDigits;
        }

        const result = await apiRequest('/orders/offline', 'POST', payload);
        if (result?.orderId) {
          if (result.guestAccessToken) {
            localStorage.setItem(`guest_order_${result.orderId}_token`, String(result.guestAccessToken));
          }
           clearCart();
           showAlert('Offline order created. Please pay at the counter to start preparation.', 'success');
           navigate(`/status/${result.orderId}${isLoggedIn ? '' : '?guest=1'}`);
           return;
         }
        throw new Error('Could not create offline order.');
      } catch (error) {
        showAlert(`Could not create offline order: ${error.message}`, 'error');
      } finally {
        setIsProcessingPayment(false);
      }
      return;
    }

    setIsProcessingPayment(true);
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setIsProcessingPayment(false);
      showAlert('Razorpay SDK failed to load. Are you online?', 'error');
      return;
    }

    try {
      const [order, razorpayConfig] = await Promise.all([
        apiRequest('/orders', 'POST', { amount: totalAmountWithTaxes }),
        apiRequest('/orders/razorpay/config')
      ]);
      const razorpayKey = String(razorpayConfig?.key_id || '').trim();
      if (!razorpayKey) {
        throw new Error('Razorpay key is missing from server config.');
      }

      const options = {
        key: razorpayKey,
        amount: order.amount,
        currency: 'INR',
        name: 'DYPCET Cafeteria',
        description: 'Order from DYPCET Cafeteria',
        order_id: order.id,
        handler: async function (response) {
          try {
            const verificationData = {
              ...response,
              items: cart,
              total_amount: totalAmountWithTaxes,
              order_instruction: normalizedInstruction
            };
            const result = await apiRequest('/orders/verify', 'POST', verificationData);

            if (result && result.orderId) {
              clearCart();
              showAlert('Order placed successfully!', 'success');
              navigate(`/status/${result.orderId}`);
            } else {
              throw new Error('Order verification failed after payment.');
            }
          } catch (verifyError) {
            showAlert(`Payment verification failed: ${verifyError.message}`, 'error');
          } finally {
            setIsProcessingPayment(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessingPayment(false);
          }
        },
        prefill: {
          name: user.name,
          email: user.email,
        },
        theme: {
          color: '#3399CC',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      setIsProcessingPayment(false);
      showAlert(`Payment initialization failed: ${error.message}`, 'error');
    }
  };

  const handleSelectPaymentMode = (nextMode) => {
    setPaymentMode(nextMode);
    if (nextMode !== 'cash') {
      setShowCashDetailsModal(false);
      return;
    }
    if (!isLoggedIn) {
      setShowCashDetailsModal(true);
    }
  };

  const handleCashModalCancel = () => {
    setShowCashDetailsModal(false);
    setGuestName('');
    setGuestMobile('');
    setPaymentMode('online');
  };

  const handleCashModalContinue = () => {
    const name = String(guestName || '').trim();
    const mobile = String(guestMobile || '').replace(/\D/g, '').slice(-10);

    if (!name) {
      showAlert('Please enter your name.', 'error');
      return;
    }
    if (!/^\d{10}$/.test(mobile)) {
      showAlert('Please enter a valid 10-digit mobile number.', 'error');
      return;
    }
    setGuestMobile(mobile);
    setShowCashDetailsModal(false);
  };

  return (
    <main className="container">
      <h2>Your Cart</h2>
      <div id="cart-container">
        {cart.length === 0 ? (
          <div className="cart-empty-state">
            <h3>Your Cart is Empty</h3>
            <p>Add items from our menu and come back to checkout.</p>
            <Link to="/menu-items" className="button">Browse Menu</Link>
          </div>
        ) : (
          <div className="responsive-table-wrapper">
            <table className="admin-table cart-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Price</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>INR {(item.price || 0).toFixed(2)}</td>
                    <td>
                      <div className="qty-stepper">
                        <button type="button" className="button-small" onClick={() => changeQuantityBy(item, -1)}>-</button>
                        <input
                          type="number"
                          value={item.quantity}
                          min="1"
                          onChange={(e) => updateItemQuantity(item.id, Math.max(1, parseInt(e.target.value || '1', 10)))}
                        />
                        <button type="button" className="button-small" onClick={() => changeQuantityBy(item, 1)}>+</button>
                      </div>
                    </td>
                    <td>INR {((item.price || 0) * item.quantity).toFixed(2)}</td>
                    <td>
                      <button
                        className="remove-btn button-small danger-btn"
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div id="cart-summary">
          <h3>Order Summary</h3>
          <div className="summary-row">
            <span>Subtotal</span>
            <span id="cart-subtotal">INR {cartTotal.toFixed(2)}</span>
          </div>
          <div className="summary-row total">
            <span>Total</span>
            <span id="cart-total">INR {totalAmountWithTaxes.toFixed(2)}</span>
          </div>
          <div className="order-instruction-box">
            <label htmlFor="orderInstruction">Order Instructions (Optional)</label>
            <textarea
              id="orderInstruction"
              placeholder="Ex: less spicy, no onion, deliver quickly..."
              rows="3"
              maxLength="500"
              value={orderInstruction}
              onChange={(e) => setOrderInstruction(e.target.value)}
            />
          </div>

          <div className="order-instruction-box">
            <label>Payment Method</label>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name="paymentMode"
                  value="online"
                  checked={paymentMode === 'online'}
                  onChange={() => handleSelectPaymentMode('online')}
                />
                Online Payment
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name="paymentMode"
                  value="cash"
                  checked={paymentMode === 'cash'}
                  onChange={() => handleSelectPaymentMode('cash')}
                />
                Cash (Pay at counter)
              </label>
            </div>

            {!isLoggedIn && paymentMode === 'cash' && (
              <p style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                You will be asked for Name and Mobile number (cash order details).
              </p>
            )}

            {paymentMode === 'online' && !isLoggedIn && (
              <p style={{ marginTop: '0.5rem', color: '#b00020', fontSize: '0.9rem' }}>
                Login is required for online payment.
              </p>
            )}
          </div>
          <div className="cart-summary-actions">
            <button type="button" className="button danger-btn" onClick={clearCart}>Clear Cart</button>
            <button
              id="checkout-btn"
              className="button"
              onClick={handlePayment}
              disabled={isProcessingPayment || Boolean(orderPause?.is_paused_now)}
            >
              {orderPause?.is_paused_now
                ? 'Ordering Paused'
                : (isProcessingPayment ? 'Processing...' : (paymentMode === 'cash' ? 'Place Cash Order' : 'Proceed to Payment'))}
            </button>
          </div>
          {orderPause?.is_paused_now && String(orderPause?.message || '').trim() && (
            <p style={{ marginTop: '0.75rem', color: '#b00020', fontSize: '0.9rem' }}>
              {orderPause.message}
            </p>
          )}
          <p style={{ marginTop: '0.75rem', color: '#b00020', fontSize: '0.9rem' }}>
            Note: Don&apos;t close or refresh the site until payment confirmation, otherwise the order may not be placed.
          </p>
        </div>
      )}

      {!isLoggedIn && paymentMode === 'cash' && showCashDetailsModal && (
        <div className="cash-modal-overlay" onClick={handleCashModalCancel}>
          <div className="cash-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cash-modal-header">
              <div>
                <h3>Cash Order Details</h3>
                <p>Enter your details to place an offline cash order.</p>
              </div>
              <button type="button" className="cash-modal-close" onClick={handleCashModalCancel}>
                ×
              </button>
            </div>

            <div className="cash-modal-body">
              <label className="cash-modal-label" htmlFor="cash_guest_name">Full Name</label>
              <div className="cash-modal-input">
                <span className="cash-modal-icon">👤</span>
                <input
                  id="cash_guest_name"
                  type="text"
                  placeholder="Your name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  autoComplete="name"
                />
              </div>

              <label className="cash-modal-label" htmlFor="cash_guest_mobile">Mobile Number</label>
              <div className="cash-modal-input">
                <span className="cash-modal-icon">📱</span>
                <input
                  id="cash_guest_mobile"
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={guestMobile}
                  maxLength={10}
                  onChange={(e) => setGuestMobile(e.target.value.replace(/\\D/g, ''))}
                  autoComplete="tel"
                />
              </div>

              <div className="cash-modal-note">
                Note: Don&apos;t close or refresh the site until confirmation, otherwise the order may not be placed.
              </div>
            </div>

            <div className="cash-modal-actions">
              <button type="button" className="button danger-btn" onClick={handleCashModalCancel}>
                Cancel
              </button>
              <button type="button" className="button" onClick={handleCashModalContinue}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default CartPage;
