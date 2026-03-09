import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../hooks/useCart'; // Import useCart hook

function Header() {
  const { user, isLoggedIn, isAdmin, isFaculty, logout } = useAuth();
  const { cartCount } = useCart();

  // Check if user is a canteen committee coordinator
  const isCanteenCoordinator = user?.email?.endsWith('@member.com');

  return (
    <header>
      <div className="header-left">
        <Link to="/" className="header-logo-link">
          <img src="/assets/dyplogo.png" alt="DYPCET Logo" className="header-logo" />
          <h1>DYPCET Cafeteria</h1>
        </Link>
      </div>
      <div className="header-right">
        <nav>
          <ul>
            <li><Link to="/menu-items">Menu</Link></li>
            {isLoggedIn ? (
              <>
                <li><Link to="/cart">Cart {cartCount > 0 ? `(${cartCount})` : ''}</Link></li>
                <li><Link to="/orders">Orders</Link></li>
                <li><Link to="/profile">Profile</Link></li>
                {isAdmin && (
                  <li><Link to="/admin/dashboard">Admin</Link></li>
                )}
                {isFaculty && isCanteenCoordinator && (
                  <li><Link to="/faculty">Faculty Panel</Link></li>
                )}
                <li>
                  <button
                    type="button"
                    className="link-button"
                    onClick={logout}
                  >
                    Logout ({user.name})
                  </button>
                </li>
              </>
            ) : (
              <li><Link to="/login">Login / Register</Link></li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export default Header;
