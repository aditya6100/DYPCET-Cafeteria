import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiRequest from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../hooks/useAlert';
import { useCart } from '../hooks/useCart';
import { MENU_CATEGORIES, CATEGORY_DISPLAY_NAMES } from '../utils/constants';

function HomePage() {
  const [menuItems, setMenuItems] = useState([]);
  const [bestSellingItems, setBestSellingItems] = useState([]);
  const [categoryTimings, setCategoryTimings] = useState([]);
  const [menuNotice, setMenuNotice] = useState('Dinner and many menu items are available only after 12:00 PM.');
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [sortBy, setSortBy] = useState('name_asc');
  const [quickFilter, setQuickFilter] = useState('ALL');
  const [selectedVariants, setSelectedVariants] = useState({});
  const [quantities, setQuantities] = useState({});
  const [showCategoryNav, setShowCategoryNav] = useState(false);

  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const { showAlert } = useAlert();
  const { cart, addToCart, cartTotal, cartCount } = useCart();

  const standardizeItemName = (value = '') => String(value)
    .replace(/\bIdali\b/gi, 'Idli')
    .replace(/\bThik\b/gi, 'Thick')
    .replace(/\bBlack Current\b/gi, 'Black Currant')
    .replace(/\bBornvita\b/gi, 'Bournvita');

  const isThaliCategory = (item) => {
    const category = String(item?.menu_type || '').toUpperCase().trim();
    return ['MAIN_COURSE', 'THALI'].includes(category);
  };

  const getPrepTimeLabel = (item) => {
    const category = String(item?.menu_type || 'REGULAR').toUpperCase().trim();
    const prepByCategory = {
      BREAKFAST: '6-8 min',
      MAIN_COURSE: '10-14 min',
      CHINESE: '12-16 min',
      SOUTH_INDIAN: '8-12 min',
      COLD_COFFEE: '3-5 min',
      MOMOS: '10-14 min',
      SANDWICH: '7-10 min',
      MAGGIE_PASTA: '8-12 min',
      ICE_CREAM: '2-3 min',
      FRIES: '6-9 min',
      NUGGETS: '8-11 min',
      SHAKES: '4-6 min',
      PIZZA: '14-18 min',
      HOT_BEVERAGES: '3-5 min',
      BURGER: '8-12 min'
    };
    return prepByCategory[category] || '8-12 min';
  };

  const parseMinutes = useCallback((timeValue) => {
    if (!timeValue) return null;
    const [hh = '0', mm = '0'] = String(timeValue).split(':');
    const h = Number(hh);
    const m = Number(mm);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return (h * 60) + m;
  }, []);

  const isCategoryAvailableNow = useCallback((category) => {
    const key = String(category || '').toUpperCase().trim();
    const timing = (categoryTimings || []).find(
      (row) => String(row?.category || '').toUpperCase().trim() === key
    );
    if (!timing || Number(timing.is_enabled) !== 1 || !timing.start_time || !timing.end_time) {
      return true;
    }

    const now = new Date();
    const nowMinutes = (now.getHours() * 60) + now.getMinutes();
    const startMinutes = parseMinutes(timing.start_time);
    const endMinutes = parseMinutes(timing.end_time);
    if (startMinutes === null || endMinutes === null) return true;

    // Supports overnight windows (e.g. 20:00 to 04:00).
    if (startMinutes <= endMinutes) {
      return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    }
    return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
  }, [categoryTimings, parseMinutes]);

  const getCategoryTimingLabel = (category) => {
    const key = String(category || '').toUpperCase().trim();
    const timing = (categoryTimings || []).find(
      (row) => String(row?.category || '').toUpperCase().trim() === key
    );
    if (!timing || Number(timing.is_enabled) !== 1 || !timing.start_time || !timing.end_time) {
      return '';
    }
    const start = String(timing.start_time || '').slice(0, 5);
    const end = String(timing.end_time || '').slice(0, 5);
    return `${start} - ${end}`;
  };

  const fetchMenu = useCallback(async () => {
    try {
      setLoadingMenu(true);
      const [data, bestSelling, noticeData, timingData] = await Promise.all([
        apiRequest('/menu?t=' + Date.now()),
        apiRequest('/menu/best-selling?limit=3').catch(() => []),
        apiRequest('/menu/notice').catch(() => ({ notice: '' })),
        apiRequest('/menu/category-timings').catch(() => [])
      ]);
      setMenuItems(data || []);
      setBestSellingItems(Array.isArray(bestSelling) ? bestSelling : []);
      setMenuNotice(String(noticeData?.notice || '').trim() || '');
      setCategoryTimings(Array.isArray(timingData) ? timingData : []);

      const initialQuantities = {};
      (data || []).forEach((item) => {
        initialQuantities[item.id] = 1;
      });
      (bestSelling || []).forEach((item) => {
        if (!initialQuantities[item.id]) {
          initialQuantities[item.id] = 1;
        }
      });
      setQuantities(initialQuantities);
    } catch (error) {
      showAlert(`Error loading menu: ${error.message}`, 'error');
    } finally {
      setLoadingMenu(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const categoryTabs = useMemo(() => {
    const present = Array.from(
      new Set((menuItems || []).map((item) => (item.menu_type || 'REGULAR').toUpperCase().trim()))
    );

    const orderedFromConstants = MENU_CATEGORIES.filter((cat) => present.includes(cat));
    const remaining = present.filter((cat) => !MENU_CATEGORIES.includes(cat)).sort();

    return ['ALL', ...orderedFromConstants, ...remaining];
  }, [menuItems]);

  const bestSellerIds = useMemo(
    () => new Set((bestSellingItems || []).map((item) => Number(item.id))),
    [bestSellingItems]
  );

  const filteredAndSortedItems = useMemo(() => {
    let items = [...menuItems];

    if (activeCategory !== 'ALL') {
      items = items.filter(
        (item) => (item.menu_type || 'REGULAR').toUpperCase().trim() === activeCategory
      );
    }

    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase();
      items = items.filter((item) => {
        const original = (item.name || '').toLowerCase();
        const normalized = standardizeItemName(item.name || '').toLowerCase();
        return original.includes(query) || normalized.includes(query);
      });
    }

    if (quickFilter === 'AVAILABLE') {
      items = items.filter((item) =>
        Number(item.is_available) === 1 && isCategoryAvailableNow(item.menu_type)
      );
    } else if (quickFilter === 'UNDER_50') {
      items = items.filter((item) => Number(item.price || 0) <= 50);
    } else if (quickFilter === 'THALI') {
      items = items.filter((item) => isThaliCategory(item));
    } else if (quickFilter === 'BEST') {
      items = items.filter((item) => bestSellerIds.has(Number(item.id)));
    } else if (quickFilter === 'TODAY') {
      items = items.filter((item) => Number(item.today_special_effective ?? item.today_special) === 1);
    }

    items.sort((a, b) => {
      if (sortBy === 'price_low_high') return Number(a.price || 0) - Number(b.price || 0);
      if (sortBy === 'price_high_low') return Number(b.price || 0) - Number(a.price || 0);
      return (a.name || '').localeCompare(b.name || '');
    });

    return items;
  }, [menuItems, activeCategory, searchText, sortBy, quickFilter, bestSellerIds, isCategoryAvailableNow]);

  const groupedMenuItems = filteredAndSortedItems.reduce((acc, item) => {
    const category = (item.menu_type || 'REGULAR').toUpperCase().trim();
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});
  const todaySpecialItems = useMemo(() => {
    let items = [...menuItems];

    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase();
      items = items.filter((item) => {
        const original = (item.name || '').toLowerCase();
        const normalized = standardizeItemName(item.name || '').toLowerCase();
        return original.includes(query) || normalized.includes(query);
      });
    }

    if (quickFilter === 'AVAILABLE') {
      items = items.filter((item) =>
        Number(item.is_available) === 1 && isCategoryAvailableNow(item.menu_type)
      );
    } else if (quickFilter === 'UNDER_50') {
      items = items.filter((item) => Number(item.price || 0) <= 50);
    }

    items = items.filter((item) => Number(item.today_special_effective ?? item.today_special) === 1);

    items.sort((a, b) => {
      if (sortBy === 'price_low_high') return Number(a.price || 0) - Number(b.price || 0);
      if (sortBy === 'price_high_low') return Number(b.price || 0) - Number(a.price || 0);
      return (a.name || '').localeCompare(b.name || '');
    });

    return items;
  }, [menuItems, searchText, quickFilter, sortBy, isCategoryAvailableNow]);

  const updateQuantity = (itemId, value) => {
    const parsed = Number.parseInt(value, 10);
    setQuantities((prev) => ({
      ...prev,
      [itemId]: Number.isNaN(parsed) || parsed < 1 ? 1 : parsed
    }));
  };

  const handleAddToCart = (item, quantity) => {
    if (!isLoggedIn) {
      showAlert('Please log in to add items to your cart.', 'error');
      navigate('/login');
      return;
    }
    addToCart(item, quantity);
    showAlert(`${item.name} added x${quantity}`, 'success');
  };

  const jumpToCategory = (category) => {
    setActiveCategory(category);
    const key = category === 'ALL' ? 'menu-start' : `category-${category}`;
    const target = document.getElementById(key);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const groupMenuItemsByVariants = (items, categoryKey = 'GENERIC') => {
    const sizeRegex = /^(.*)\s+\((S|M|L|XL)\)$/i;
    const sizeOrder = { S: 1, M: 2, L: 3, XL: 4 };
    const grouped = new Map();

    (items || []).forEach((item) => {
      const name = String(item?.name || '').trim();
      const match = name.match(sizeRegex);
      if (!match) {
        const groupKey = `${categoryKey}:item:${item.id}`;
        grouped.set(groupKey, {
          groupKey,
          displayName: name,
          variants: [{ ...item, variantLabel: null }]
        });
        return;
      }

      const baseName = String(match[1] || '').trim();
      const sizeLabel = String(match[2] || '').toUpperCase();
      const groupKey = `${categoryKey}:base:${baseName.toLowerCase()}`;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          groupKey,
          displayName: baseName,
          variants: []
        });
      }
      grouped.get(groupKey).variants.push({
        ...item,
        variantLabel: sizeLabel
      });
    });

    return Array.from(grouped.values()).map((group) => ({
      ...group,
      variants: (group.variants || []).sort((a, b) => {
        const aOrder = sizeOrder[String(a.variantLabel || '').toUpperCase()] || 99;
        const bOrder = sizeOrder[String(b.variantLabel || '').toUpperCase()] || 99;
        return aOrder - bOrder;
      })
    }));
  };

  return (
    <main>
      <section id="menu-start" className="menu-section container">
        <div className="menu-header">
          <span className="menu-header-tag">Fresh and Hygienic</span>
          <h2>Our Delicious Menu</h2>
          <p className="menu-subtitle">Fresh, hygienic, and delicious meals for students and staff</p>
        </div>

        {String(menuNotice || '').trim() && (
          <div className="menu-notice-banner" role="note" aria-label="Menu availability notice">
            Notice: {menuNotice}
          </div>
        )}

        <div className="menu-toolbar sticky">
          <div className="menu-toolbar-top">
            <input
              type="text"
              className="menu-search"
              placeholder="Search dishes..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />

            <select className="menu-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name_asc">Sort: Name (A-Z)</option>
              <option value="price_low_high">Sort: Price Low to High</option>
              <option value="price_high_low">Sort: Price High to Low</option>
            </select>

            <button onClick={fetchMenu} className="button" title="Refresh to see latest menu updates">
              Refresh Menu
            </button>
          </div>

          <div className="menu-quick-filters">
            <button type="button" className={`menu-quick-chip ${quickFilter === 'ALL' ? 'active' : ''}`} onClick={() => setQuickFilter('ALL')}>All</button>
            <button type="button" className={`menu-quick-chip ${quickFilter === 'AVAILABLE' ? 'active' : ''}`} onClick={() => setQuickFilter('AVAILABLE')}>Available Now</button>
            <button type="button" className={`menu-quick-chip ${quickFilter === 'UNDER_50' ? 'active' : ''}`} onClick={() => setQuickFilter('UNDER_50')}>Under ₹50</button>
            <button type="button" className={`menu-quick-chip ${quickFilter === 'THALI' ? 'active' : ''}`} onClick={() => setQuickFilter('THALI')}>Thali</button>
            <button type="button" className={`menu-quick-chip ${quickFilter === 'BEST' ? 'active' : ''}`} onClick={() => setQuickFilter('BEST')}>Best Sellers</button>
            <button type="button" className={`menu-quick-chip ${quickFilter === 'TODAY' ? 'active' : ''}`} onClick={() => setQuickFilter('TODAY')}>Today's Special</button>
            <button
              type="button"
              className={`menu-quick-chip section-toggle-btn ${showCategoryNav ? 'active' : ''}`}
              onClick={() => setShowCategoryNav(!showCategoryNav)}
            >
              {showCategoryNav ? '✕ Close Sections' : '☰ Browse Sections'}
            </button>
          </div>

          {showCategoryNav && (
            <div className="menu-category-nav-horizontal">
              <button
                type="button"
                className={`category-nav-item ${activeCategory === 'ALL' ? 'active' : ''}`}
                onClick={() => jumpToCategory('ALL')}
              >
                All Sections
              </button>
              {categoryTabs
                .filter((category) => category !== 'ALL')
                .map((category) => (
                  <button
                    key={`nav-horiz-${category}`}
                    type="button"
                    className={`category-nav-item ${activeCategory === category ? 'active' : ''}`}
                    onClick={() => jumpToCategory(category)}
                  >
                    {CATEGORY_DISPLAY_NAMES[category] || category.replace(/_/g, ' ')}
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="menu-results-line">Showing {filteredAndSortedItems.length} item(s)</div>

        <div className="menu-layout">
          <div className="menu-sections-wrapper">
          {loadingMenu ? (
            <div className="menu-skeleton-grid" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={`menu-skeleton-${idx}`} className="menu-skeleton-card">
                  <div className="menu-skeleton-image shimmer" />
                  <div className="menu-skeleton-line shimmer" />
                  <div className="menu-skeleton-line short shimmer" />
                  <div className="menu-skeleton-row">
                    <div className="menu-skeleton-chip shimmer" />
                    <div className="menu-skeleton-chip shimmer" />
                  </div>
                </div>
              ))}
            </div>
          ) : Object.keys(groupedMenuItems).length === 0 ? (
            <div className="no-menu">
              <p>No matching menu items found.</p>
              <div className="no-menu-actions">
                <button type="button" className="button-small" onClick={() => setQuickFilter('ALL')}>Clear Quick Filter</button>
                <button type="button" className="button-small" onClick={() => setActiveCategory('ALL')}>Show All Sections</button>
                <button type="button" className="button-small" onClick={() => setSearchText('')}>Clear Search</button>
              </div>
            </div>
          ) : (
            <>
              {/* Featured Sections - Only show when NOT searching and NOT filtering by a specific category */}
              {!searchText.trim() && activeCategory === 'ALL' && (
                <>
                  {bestSellingItems.length > 0 && (
                    <div className="menu-category-wrapper best-selling-section">
                      <div className="category-title-section">
                        <h3 className="category-title">Best Selling Items</h3>
                        <span className="item-count">Top {bestSellingItems.length}</span>
                      </div>
                      <div className="menu-items-grid">
                        {bestSellingItems.map((item) => (
                          <div
                            key={`best-${item.id}`}
                            className={`menu-item-card ${(Number(item.is_available) !== 1 || !isCategoryAvailableNow(item.menu_type)) ? 'unavailable' : ''}`}
                          >
                            {(Number(item.is_available) !== 1 || !isCategoryAvailableNow(item.menu_type)) && <span className="unavailable-badge">Unavailable</span>}
                            <span className="best-seller-badge">Best Seller</span>
                            <div className="menu-item-image">
                              {item.image && !String(item.image).includes('default-food') ? (
                                <img src={`/${item.image}`} alt={item.name} />
                              ) : (
                                <div className="menu-item-no-image">{item.name}</div>
                              )}
                            </div>
                            <div className="menu-item-details">
                              <h4 className="item-name">{standardizeItemName(item.name)}</h4>
                              {item.description && <p className="item-description" style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem', lineHeight: '1.2' }}>{item.description}</p>}
                              <p className="item-price">{'\u20B9'}{(item.price || 0).toFixed(2)}</p>
                              <p className="prep-time">Ready in {getPrepTimeLabel(item)}</p>
                              <p className="best-seller-meta">{item.units_sold || 0} sold</p>
                              <div className="item-controls">
                                <div className="quantity-control">
                                  <label>Qty:</label>
                                  <input
                                    type="number"
                                    value={quantities[item.id] || 1}
                                    min="1"
                                    onChange={(e) => updateQuantity(item.id, e.target.value)}
                                    disabled={Number(item.is_available) !== 1 || !isCategoryAvailableNow(item.menu_type)}
                                  />
                                </div>
                                <button
                                  className="button add-to-cart-btn"
                                  onClick={() => handleAddToCart(item, quantities[item.id] || 1)}
                                  disabled={Number(item.is_available) !== 1 || !isCategoryAvailableNow(item.menu_type)}
                                >
                                  Add to Cart
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {todaySpecialItems.length > 0 && (
                    <div id="category-TODAY_SPECIAL" className="menu-category-wrapper today-special-section">
                      <div className="category-title-section">
                        <h3 className="category-title">Today's Special</h3>
                        <span className="item-count">({todaySpecialItems.length} items)</span>
                      </div>
                      <div className="menu-items-grid">
                        {todaySpecialItems.map((item) => (
                          <div
                            key={`special-${item.id}`}
                            className={`menu-item-card ${(Number(item.is_available) !== 1 || !isCategoryAvailableNow(item.menu_type)) ? 'unavailable' : ''}`}
                          >
                            {(Number(item.is_available) !== 1 || !isCategoryAvailableNow(item.menu_type)) && <span className="unavailable-badge">Unavailable</span>}
                            <div className="menu-item-image">
                              {item.image && !String(item.image).includes('default-food') ? (
                                <img src={`/${item.image}`} alt={item.name} />
                              ) : (
                                <div className="menu-item-no-image">{item.name}</div>
                              )}
                            </div>
                            <div className="menu-item-details">
                              <h4 className="item-name">{standardizeItemName(item.name)}</h4>
                              {item.description && <p className="item-description" style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem', lineHeight: '1.2' }}>{item.description}</p>}
                              <p className="item-price">{'\u20B9'}{(item.price || 0).toFixed(2)}</p>
                              <p className="prep-time">Ready in {getPrepTimeLabel(item)}</p>
                              <div className="item-controls">
                                <div className="quantity-control">
                                  <label>Qty:</label>
                                  <input
                                    type="number"
                                    value={quantities[item.id] || 1}
                                    min="1"
                                    onChange={(e) => updateQuantity(item.id, e.target.value)}
                                    disabled={Number(item.is_available) !== 1 || !isCategoryAvailableNow(item.menu_type)}
                                  />
                                </div>
                                <button
                                  className="button add-to-cart-btn"
                                  onClick={() => handleAddToCart(item, quantities[item.id] || 1)}
                                  disabled={Number(item.is_available) !== 1 || !isCategoryAvailableNow(item.menu_type)}
                                >
                                  Add to Cart
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Main Menu Categories */}
              {Object.keys(groupedMenuItems).sort().map((category) => {
                const items = groupedMenuItems[category];
                const visibleItems = (items || []).filter(
                  (item) => Number(item.today_special_effective ?? item.today_special) !== 1
                );
                if (!visibleItems.length) return null;
                const groupedVisibleItems = groupMenuItemsByVariants(visibleItems, category);

                return (
                  <div key={category} id={`category-${category}`} className="menu-category-wrapper">
                    <div className="category-title-section">
                      <h3 className="category-title">{CATEGORY_DISPLAY_NAMES[category] || category}</h3>
                      <span className="item-count">({groupedVisibleItems.length} items)</span>
                      {getCategoryTimingLabel(category) && (
                        <span className={`category-time-chip ${isCategoryAvailableNow(category) ? 'open' : 'closed'}`}>
                          {isCategoryAvailableNow(category) ? 'Open' : 'Opens'} {getCategoryTimingLabel(category)}
                        </span>
                      )}
                    </div>
                    <div className="menu-items-grid">
                      {groupedVisibleItems.map((group) => {
                        const selectedId = Number(selectedVariants[group.groupKey] || 0);
                        const selectedItem = (group.variants || []).find((v) => Number(v.id) === selectedId)
                          || group.variants[0];
                        const itemImageSource = (selectedItem?.image && !String(selectedItem.image).includes('default-food'))
                          ? `/${selectedItem.image}`
                          : null;
                        const isUnavailable = Number(selectedItem?.is_available) !== 1 || !isCategoryAvailableNow(selectedItem?.menu_type || category);

                        return (
                        <div
                          key={group.groupKey}
                          className={`menu-item-card ${isUnavailable ? 'unavailable' : ''}`}
                        >
                          {isUnavailable && <span className="unavailable-badge">Unavailable</span>}
                          <div className="menu-item-image">
                            {itemImageSource ? (
                              <img src={itemImageSource} alt={group.displayName} />
                            ) : (
                              <div className="menu-item-no-image">{standardizeItemName(group.displayName)}</div>
                            )}
                          </div>
                          <div className="menu-item-details">
                            <h4 className="item-name">{standardizeItemName(group.displayName)}</h4>
                            {selectedItem.description && <p className="item-description" style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem', lineHeight: '1.2' }}>{selectedItem.description}</p>}
                            {group.variants.length > 1 && (
                              <div className="variant-selector">
                                <label>Size:</label>
                                <select
                                  value={selectedItem.id}
                                  onChange={(e) => setSelectedVariants((prev) => ({
                                    ...prev,
                                    [group.groupKey]: Number(e.target.value)
                                  }))}
                                >
                                  {group.variants.map((variant) => (
                                    <option key={variant.id} value={variant.id}>
                                      {variant.variantLabel} - {'\u20B9'}{Number(variant.price || 0).toFixed(2)}{!variant.is_available ? ' (Unavailable)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <p className="item-price">{'\u20B9'}{(selectedItem.price || 0).toFixed(2)}</p>
                            <p className="prep-time">Ready in {getPrepTimeLabel(selectedItem)}</p>
                            <div className="item-controls">
                              <div className="quantity-control">
                                <label>Qty:</label>
                                <input
                                  type="number"
                                  value={quantities[selectedItem.id] || 1}
                                  min="1"
                                  onChange={(e) => updateQuantity(selectedItem.id, e.target.value)}
                                  disabled={isUnavailable}
                                />
                              </div>
                              <button
                                className="button add-to-cart-btn"
                                onClick={() => handleAddToCart(selectedItem, quantities[selectedItem.id] || 1)}
                                disabled={isUnavailable}
                              >
                                Add to Cart
                              </button>
                            </div>
                          </div>
                        </div>
                      )})}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          </div>

          <aside className="menu-sections-sidebar">
            <h4>Sections</h4>
            <button
              type="button"
              className={`section-nav-btn ${activeCategory === 'ALL' ? 'active' : ''}`}
              onClick={() => jumpToCategory('ALL')}
            >
              All Sections
            </button>
            {categoryTabs
              .filter((category) => category !== 'ALL')
              .map((category) => (
                <button
                  key={`side-${category}`}
                  type="button"
                  className={`section-nav-btn ${activeCategory === category ? 'active' : ''}`}
                  onClick={() => jumpToCategory(category)}
                >
                  {CATEGORY_DISPLAY_NAMES[category] || category}
                </button>
              ))}
          </aside>
        </div>
      </section>

      <section className="about-cafeteria-section">
        <div className="container">
          <h2>About Our Cafeteria</h2>
          <p className="about-description">
            At DYPCET Cafeteria, we are committed to providing delicious, hygienic, and affordable meals to our students and staff.
          </p>
        </div>
      </section>

      <button
        type="button"
        className="menu-top-btn"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        Top
      </button>

      {cart.length > 0 && (
        <div className="floating-cart-bar">
          <div className="floating-cart-info">
            <span className="cart-count-badge">{cartCount} Item{cartCount !== 1 ? 's' : ''} added</span>
            <span className="cart-total-price">Total: ₹{cartTotal.toFixed(2)}</span>
          </div>
          <button className="button view-cart-btn" onClick={() => navigate('/cart')}>
            View Cart 🛒
          </button>
        </div>
      )}
    </main>
  );
}

export default HomePage;
