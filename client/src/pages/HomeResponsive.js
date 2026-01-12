import React from 'react';
import Home from './Home';
import HomeMobile from './HomeMobile';

const HomeResponsive = () => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  return isMobile ? <HomeMobile /> : <Home />;
};

export default HomeResponsive;
