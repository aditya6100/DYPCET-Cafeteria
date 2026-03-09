import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiRequest from '../utils/api';

const HERO_SLIDES = [
  '/assets/HomePage_Presentation/Slide1.png',
  '/assets/HomePage_Presentation/Slide2.png',
  '/assets/HomePage_Presentation/Slide3.png',
  '/assets/HomePage_Presentation/Slide4.png',
  '/assets/HomePage_Presentation/Slide5.png',
  '/assets/HomePage_Presentation/Slide6.png',
];

function WelcomePage() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [notices, setNotices] = useState([]);
  const [committeeMembers, setCommitteeMembers] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSlideIndex((prevIndex) => (prevIndex + 1) % HERO_SLIDES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const data = await apiRequest('/notices');
        setNotices(Array.isArray(data) ? data : []);
      } catch (error) {
        setNotices([]);
      }
    };

    fetchNotices();
  }, []);

  useEffect(() => {
    const fetchCommittee = async () => {
      try {
        const data = await apiRequest('/committee');
        setCommitteeMembers(Array.isArray(data) ? data : []);
      } catch (error) {
        setCommitteeMembers([]);
      }
    };

    fetchCommittee();
  }, []);

  const goToNext = () => {
    setSlideIndex((prevIndex) => (prevIndex + 1) % HERO_SLIDES.length);
  };

  const goToPrev = () => {
    setSlideIndex((prevIndex) => (prevIndex - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  };

  return (
    <>
      {/* CANTEEN INTRO SECTION */}
      <section className="canteen-intro-band">
        <div className="container canteen-intro-layout">
          <div className="canteen-intro-block">
            <span className="canteen-intro-kicker">Nutritious and Affordable Dining</span>
            <h2>Institute Canteen</h2>
            <p>
              Our institute canteen provides hygienic and nutritious food at affordable prices,
              catering to the daily nutritional requirements of students and staff members.
            </p>
          </div>

          <div className="canteen-intro-divider"></div>

          <div className="canteen-intro-block">
            <span className="canteen-intro-kicker">About Cafeteria</span>
            <p>
              As many students come from distant places, it is essential for students to have nutritious food
              and refreshments at affordable prices so they can actively participate in daily academic activities.
              The college canteen supports this by meeting the nutritional needs of students and staff members,
              with a separate wing for students and staff.
            </p>
            <p className="canteen-intro-timing"><strong>Timing:</strong> 09:00 AM to 04:00 PM</p>
          </div>
        </div>
      </section>

      {/* HERO SLIDESHOW */}
      <section className="hero-slideshow-container">
        {HERO_SLIDES.map((slide, index) => (
          <div
            key={slide}
            className="slide"
            style={{
              backgroundImage: `url('${slide}')`,
              opacity: index === slideIndex ? 1 : 0,
              transform: index === slideIndex ? 'scale(1)' : 'scale(1.06)',
              zIndex: index === slideIndex ? 1 : 0
            }}
          />
        ))}

        <div className="hero-fixed-cta">
          <Link to="/menu-items#menu-start" className="button hero-cta">Order Now</Link>
        </div>

        <div className="hero-overlay">
          <button type="button" className="hero-nav prev" onClick={goToPrev} aria-label="Previous slide">
            {'\u2039'}
          </button>
          <button type="button" className="hero-nav next" onClick={goToNext} aria-label="Next slide">
            {'\u203A'}
          </button>

          <div className="hero-dots" aria-label="Slideshow indicators">
            {HERO_SLIDES.map((_, index) => (
              <button
                key={`dot-${index}`}
                type="button"
                className={`hero-dot ${index === slideIndex ? 'active' : ''}`}
                onClick={() => setSlideIndex(index)}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* SINGLE COLUMN CONTENT BELOW SLIDESHOW */}
      <section className="cafeteria-facilities-section">
        <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* 1. CAMPUS FACILITY */}
          <div className="cafeteria-section-head">
            <span className="cafeteria-section-kicker">Campus Facility</span>
            <h2>Cafeteria Facilities</h2>
            <p>
              The DYPCET Cafeteria delivers hygienic, nutritious, and affordable food with fast service,
              digital ordering convenience, and a comfortable, student-friendly dining atmosphere for everyday campus life.
            </p>
          </div>

          {/* NOTICES (Optional, placed here for visibility) */}
          {notices.length > 0 && (
            <div className="home-notices-panel" style={{ borderLeft: '5px solid var(--secondary-color)' }}>
              <div className="home-notices-header">
                <span className="home-notices-kicker">Notice Board</span>
                <h3>Latest Notices</h3>
              </div>
              <div className="home-notices-list">
                {notices.slice(0, 3).map((notice) => (
                  <article key={notice.id} className="home-notice-item">
                    <h4>{notice.title}</h4>
                    {notice.image && (
                      <img src={`/${notice.image}`} alt={notice.title} className="home-notice-image" />
                    )}
                    <p>{notice.content}</p>
                    <small>
                      By {notice.created_by_name || 'Committee Member'} | {new Date(notice.created_at).toLocaleDateString()}
                    </small>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* 2. GOVERNANCE / COMMITTEE */}
          <div className="committee-panel">
            <div className="committee-head">
              <span className="committee-kicker">Governance</span>
              <h3>Canteen Committee</h3>
            </div>
            <div className="committee-table-wrap">
              <table className="committee-table">
                <thead>
                  <tr>
                    <th>Sr. No.</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {committeeMembers.map((member) => (
                    <tr key={member.id || member.sr_no}>
                      <td>{member.sr_no}</td>
                      <td>{member.name}</td>
                      <td>{member.department}</td>
                      <td>{member.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. NUTRITIOUS FOOD OPTIONS & INFO STRIP */}
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div className="cafeteria-facility-grid">
              <article className="cafeteria-facility-card">
                <h3>Nutritious Food Options</h3>
                <p>Well-balanced snacks and meal choices are made available for students and staff.</p>
              </article>
              <article className="cafeteria-facility-card">
                <h3>Hygiene and Cleanliness</h3>
                <p>Food preparation and serving areas are maintained with cleanliness and safety in mind.</p>
              </article>
              <article className="cafeteria-facility-card">
                <h3>Digital Ordering Support</h3>
                <p>Students can place orders online for a smoother pickup experience during busy hours.</p>
              </article>
            </div>

            <div className="cafeteria-info-strip">
              <div className="cafeteria-info-item">
                <span className="cafeteria-info-label">Availability</span>
                <strong>Working Days</strong>
              </div>
              <div className="cafeteria-info-item">
                <span className="cafeteria-info-label">Service Mode</span>
                <strong>Dine-In and Pickup</strong>
              </div>
              <div className="cafeteria-info-item">
                <span className="cafeteria-info-label">Location</span>
                <strong>Inside DYPCET Campus</strong>
              </div>
            </div>
          </div>

          {/* 4. AT A GLANCE */}
          <div className="cafeteria-glance-panel">
            <div className="cafeteria-glance-title">At a Glance</div>
            <div className="cafeteria-glance-grid">
              <div className="cafeteria-glance-item">
                <span className="cafeteria-glance-dot" />
                <p>Neat seating area suitable for daily student and staff use.</p>
              </div>
              <div className="cafeteria-glance-item">
                <span className="cafeteria-glance-dot" />
                <p>Simple online ordering flow with faster service during peak breaks.</p>
              </div>
              <div className="cafeteria-glance-item">
                <span className="cafeteria-glance-dot" />
                <p>Menu supports regular campus food preferences and quick snacks.</p>
              </div>
              <div className="cafeteria-glance-item">
                <span className="cafeteria-glance-dot" />
                <p>Focused on hygiene, cleanliness, and dependable day-to-day service.</p>
              </div>
            </div>
          </div>

        </div>
      </section>
    </>
  );
}

export default WelcomePage;
