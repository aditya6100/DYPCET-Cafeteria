// frontend/src/hooks/useCart.js

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAlert } from './useAlert';

const getCartFromLocalStorage = () => {
    try {
        const cart = localStorage.getItem('cart');
        return cart ? JSON.parse(cart) : [];
    } catch (error) {
        console.error("Error parsing cart from localStorage:", error);
        return [];
    }
};

const saveCartToLocalStorage = (cart) => {
    localStorage.setItem('cart', JSON.stringify(cart));
};

export const useCart = () => {
    const { isLoggedIn } = useAuth();
    const { showAlert } = useAlert();
    const [cart, setCart] = useState(() => {
        // Initialize from localStorage on first render
        return getCartFromLocalStorage();
    });

    // Load cart from localStorage when login status changes
    useEffect(() => {
        if (isLoggedIn) {
            const savedCart = getCartFromLocalStorage();
            setCart(savedCart);
        } else {
            // Clear cart if logged out
            setCart([]);
            localStorage.removeItem('cart');
        }
    }, [isLoggedIn]);

    // Save cart to localStorage whenever it changes
    useEffect(() => {
        saveCartToLocalStorage(cart);
    }, [cart]);

    const addToCart = useCallback((item, quantity = 1) => {
        if (!isLoggedIn) {
            showAlert("Please log in to add items to your cart.", "error");
            return false; 
        }

        setCart(prevCart => {
            const existingItem = prevCart.find(i => i.id === item.id);
            let updatedCart;
            if (existingItem) {
                updatedCart = prevCart.map(i =>
                    i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i
                );
            } else {
                updatedCart = [...prevCart, { ...item, quantity }];
            }
            // Immediately save to localStorage
            saveCartToLocalStorage(updatedCart);
            return updatedCart;
        });
        showAlert(`${item.name} added to cart!`, 'success');
        return true;
    }, [isLoggedIn, showAlert]);

    const removeFromCart = useCallback((itemId) => {
        setCart(prevCart => {
            const updatedCart = prevCart.filter(item => item.id !== itemId);
            saveCartToLocalStorage(updatedCart);
            return updatedCart;
        });
        showAlert("Item removed from cart.", "info");
    }, [showAlert]);

    const updateItemQuantity = useCallback((itemId, newQuantity) => {
        setCart(prevCart => {
            let updatedCart;
            if (newQuantity <= 0) {
                updatedCart = prevCart.filter(item => item.id !== itemId);
            } else {
                updatedCart = prevCart.map(item =>
                    item.id === itemId ? { ...item, quantity: newQuantity } : item
                );
            }
            saveCartToLocalStorage(updatedCart);
            return updatedCart;
        });
    }, []);

    const clearCart = useCallback(() => {
        setCart([]);
        localStorage.removeItem('cart');
        showAlert("Cart cleared.", "info");
    }, [showAlert]);

    const cartTotal = cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    return {
        cart,
        addToCart,
        removeFromCart,
        updateItemQuantity,
        clearCart,
        cartTotal,
        cartCount,
    };
};
