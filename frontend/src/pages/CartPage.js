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

  const taxes = cartTotal * 0.05;
  const totalAmountWithTaxes = cartTotal + taxes;

  useEffect(() => {
    if (!isLoggedIn) {
      showAlert('Please log in to view your cart.', 'error');
      navigate('/login');
    }
  }, [isLoggedIn, navigate, showAlert]);

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

    const instructionInput = window.prompt(
      'Any instruction for your order? (optional)\nExamples: less spicy, no onion, extra sauce',
      orderInstruction
    );
    if (instructionInput === null) {
      return;
    }
    const normalizedInstruction = String(instructionInput || '').trim().slice(0, 500);
    setOrderInstruction(normalizedInstruction);

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

  if (!isLoggedIn) {
    return null;
  }

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
        )}
      </div>

      {cart.length > 0 && (
        <div id="cart-summary">
          <h3>Order Summary</h3>
          <div className="summary-row">
            <span>Subtotal</span>
            <span id="cart-subtotal">INR {cartTotal.toFixed(2)}</span>
          </div>
          <div className="summary-row">
            <span>Taxes & Charges (5%)</span>
            <span id="cart-taxes">INR {taxes.toFixed(2)}</span>
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
          <div className="cart-summary-actions">
            <button type="button" className="button danger-btn" onClick={clearCart}>Clear Cart</button>
            <button
              id="checkout-btn"
              className="button"
              onClick={handlePayment}
              disabled={isProcessingPayment}
            >
              {isProcessingPayment ? 'Processing...' : 'Proceed to Payment'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default CartPage;
