import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../hooks/useCart'; // Import useCart hook

function Header() {
  const { user, isLoggedIn, isAdmin, isFaculty, logout } = useAuth();
  const { cartCount } = useCart();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check if user is a canteen committee coordinator
  const isCanteenCoordinator = user?.email?.endsWith('@member.com');

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <header>
      <div className="header-left">
        <Link to="/" className="header-logo-link" onClick={closeMobileMenu}>
          <img src="/assets/dyplogo.png" alt="DYPCET Logo" className="header-logo" />
          <h1>DYPCET Cafeteria</h1>
        </Link>
      </div>

      <button className="mobile-menu-toggle" onClick={toggleMobileMenu} aria-label="Toggle navigation">
        <span className={`hamburger ${isMobileMenuOpen ? 'open' : ''}`}></span>
      </button>

      <div className={`header-right ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <nav>
          <ul>
            <li><Link to="/menu-items" onClick={closeMobileMenu}>Menu</Link></li>
            {isLoggedIn ? (
              <>
                <li><Link to="/cart" onClick={closeMobileMenu}>Cart {cartCount > 0 ? `(${cartCount})` : ''}</Link></li>
                <li><Link to="/orders" onClick={closeMobileMenu}>Orders</Link></li>
                <li><Link to="/profile" onClick={closeMobileMenu}>Profile</Link></li>
                {isAdmin && (
                  <li><Link to="/admin/dashboard" onClick={closeMobileMenu}>Admin</Link></li>
                )}
                {isFaculty && isCanteenCoordinator && (
                  <li><Link to="/faculty" onClick={closeMobileMenu}>Faculty Panel</Link></li>
                )}
                <li>
                  <button
                    type="button"
                    className="link-button logout-btn"
                    onClick={() => {
                      logout();
                      closeMobileMenu();
                    }}
                  >
                    Logout ({user.name})
                  </button>
                </li>
              </>
            ) : (
              <li><Link to="/login" onClick={closeMobileMenu}>Login / Register</Link></li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export default Header;
